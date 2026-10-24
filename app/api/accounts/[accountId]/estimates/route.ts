import { NextRequest, NextResponse } from 'next/server';
import { requireAuthentication, requirePermission, handleGuardError } from '@/lib/server-guards';
import { Permission } from '@/lib/permissions';
import { createApiSupabaseClient } from '@/lib/supabase-server';
import { estimatesService } from '@/lib/estimates-service';
import { createEstimateSchema } from '@/lib/validation-schemas';
import { logger } from '@/lib/debug-logger';
import { EstimateStatus } from '@/lib/supabase';

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

/**
 * GET /api/accounts/[accountId]/estimates
 * List estimates within account boundary
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await params;
    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const user = await requireAuthentication(request);
    await requirePermission(user, Permission.ESTIMATES_READ, { accountId }, supabase);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as EstimateStatus | null;
    const projectId = searchParams.get('projectId') || undefined;
    const search = searchParams.get('search') || undefined;

    const { data: estimates, count } = await estimatesService.getEstimates(
      accountId,
      {
        status: status || undefined,
        projectId,
        search,
      },
      supabase,
    );

    return NextResponse.json({
      success: true,
      estimates,
      count,
    });
  } catch (error: unknown) {
    logger.error('Error in GET /api/accounts/[accountId]/estimates', {}, error as Error);
    return handleGuardError(error);
  }
}

/**
 * POST /api/accounts/[accountId]/estimates
 * Create draft estimate with server-side validation and Idempotency-Key support
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await params;
    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const user = await requireAuthentication(request);
    await requirePermission(user, Permission.ESTIMATES_CREATE, { accountId }, supabase);

    // Read Idempotency-Key from standard header or JSON body
    const idempotencyHeader = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
    const rawBody = await request.json();

    const parsed = createEstimateSchema.safeParse({
      ...rawBody,
      idempotency_key: idempotencyHeader || rawBody.idempotency_key || null,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const inputData = parsed.data;

    const { estimate, isDuplicate } = await estimatesService.createEstimate(
      accountId,
      {
        title: inputData.title,
        projectId: inputData.project_id || null,
        currency: inputData.currency,
        validUntil: inputData.valid_until || null,
        notes: inputData.notes || null,
        terms: inputData.terms || null,
        discountRateBasisPoints: inputData.discount_rate_basis_points,
        taxRateBasisPoints: inputData.tax_rate_basis_points,
        lineItems: inputData.line_items,
        idempotencyKey: inputData.idempotency_key,
      },
      user.id,
      supabase,
    );

    const response = NextResponse.json(
      {
        success: true,
        estimate,
        isDuplicate,
      },
      { status: isDuplicate ? 200 : 201 },
    );

    if (isDuplicate) {
      response.headers.set('Idempotent-Replayed', 'true');
    }

    return response;
  } catch (error: unknown) {
    logger.error('Error in POST /api/accounts/[accountId]/estimates', {}, error as Error);
    return handleGuardError(error);
  }
}
