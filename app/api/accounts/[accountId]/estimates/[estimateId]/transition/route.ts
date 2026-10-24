import { NextRequest, NextResponse } from 'next/server';
import { requireAuthentication, requirePermission, handleGuardError } from '@/lib/server-guards';
import { Permission } from '@/lib/permissions';
import { createApiSupabaseClient } from '@/lib/supabase-server';
import { estimatesService } from '@/lib/estimates-service';
import { transitionEstimateStatusSchema } from '@/lib/validation-schemas';
import { logger } from '@/lib/debug-logger';
import { EstimateStatus } from '@/lib/supabase';

interface RouteContext {
  params: Promise<{
    accountId: string;
    estimateId: string;
  }>;
}

/**
 * POST /api/accounts/[accountId]/estimates/[estimateId]/transition
 * Handle state lifecycle transitions (draft -> sent -> accepted | rejected)
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, estimateId } = await params;
    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const user = await requireAuthentication(request);
    const rawBody = await request.json();
    const parsed = transitionEstimateStatusSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const { status: targetStatus, rejection_reason } = parsed.data;

    // RBAC: Sending or accepting/rejecting requires ESTIMATES_SEND permission or client authorization
    await requirePermission(user, Permission.ESTIMATES_SEND, { accountId }, supabase);

    const updated = await estimatesService.transitionStatus(
      accountId,
      estimateId,
      targetStatus as EstimateStatus,
      rejection_reason || undefined,
      supabase,
    );

    return NextResponse.json({
      success: true,
      estimate: updated,
    });
  } catch (error: unknown) {
    logger.error('Error in POST estimate status transition', {}, error as Error);
    return handleGuardError(error);
  }
}
