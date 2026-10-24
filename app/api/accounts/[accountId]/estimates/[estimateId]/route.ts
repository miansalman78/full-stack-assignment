import { NextRequest, NextResponse } from 'next/server';
import { requireAuthentication, requirePermission, handleGuardError } from '@/lib/server-guards';
import { Permission } from '@/lib/permissions';
import { createApiSupabaseClient } from '@/lib/supabase-server';
import { estimatesService } from '@/lib/estimates-service';
import { updateEstimateSchema } from '@/lib/validation-schemas';
import { logger } from '@/lib/debug-logger';

interface RouteContext {
  params: Promise<{
    accountId: string;
    estimateId: string;
  }>;
}

/**
 * GET /api/accounts/[accountId]/estimates/[estimateId]
 * Get estimate details with line items
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, estimateId } = await params;
    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const user = await requireAuthentication(request);
    await requirePermission(user, Permission.ESTIMATES_READ, { accountId }, supabase);

    const estimate = await estimatesService.getEstimateById(accountId, estimateId, supabase);
    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      estimate,
    });
  } catch (error: unknown) {
    logger.error('Error in GET estimate by id', {}, error as Error);
    return handleGuardError(error);
  }
}

/**
 * PATCH /api/accounts/[accountId]/estimates/[estimateId]
 * Update a draft estimate and line items
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, estimateId } = await params;
    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const user = await requireAuthentication(request);
    await requirePermission(user, Permission.ESTIMATES_UPDATE, { accountId }, supabase);

    const rawBody = await request.json();
    const parsed = updateEstimateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const updated = await estimatesService.updateEstimate(
      accountId,
      estimateId,
      {
        title: parsed.data.title,
        projectId: parsed.data.project_id,
        currency: parsed.data.currency,
        validUntil: parsed.data.valid_until,
        notes: parsed.data.notes,
        terms: parsed.data.terms,
        discountRateBasisPoints: parsed.data.discount_rate_basis_points,
        taxRateBasisPoints: parsed.data.tax_rate_basis_points,
        lineItems: parsed.data.line_items,
      },
      supabase,
    );

    return NextResponse.json({
      success: true,
      estimate: updated,
    });
  } catch (error: unknown) {
    logger.error('Error in PATCH estimate', {}, error as Error);
    return handleGuardError(error);
  }
}

/**
 * DELETE /api/accounts/[accountId]/estimates/[estimateId]
 * Explicitly disallow hard deletes to enforce audit compliance
 */
export async function DELETE() {
  return NextResponse.json(
    {
      error: 'Hard deletion of financial estimates is prohibited. Estimates maintain financial audit history.',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 },
  );
}
