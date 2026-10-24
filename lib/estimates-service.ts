/**
 * Estimates Calculation & Service Engine
 *
 * Enforces strict financial calculation in minor units (BIGINT/integers).
 * Client-submitted totals are NEVER trusted; everything is computed and validated server-side.
 *
 * Calculation Rules:
 * 1. Line Item Amount: Math.round(quantity * unit_price_minor)
 * 2. Subtotal: sum(line_item.amount_minor)
 * 3. Discount: Math.round((subtotal_minor * discount_rate_basis_points) / 10000)
 * 4. Taxable Amount: Math.max(0, subtotal_minor - discount_minor)
 * 5. Tax: Math.round((taxable_amount * tax_rate_basis_points) / 10000)
 * 6. Total: taxable_amount + tax_minor
 */

import { AppSupabaseClient, Estimate, EstimateLineItem, EstimateStatus } from './supabase';
import { logger } from './debug-logger';

export interface RawLineItemInput {
  description: string;
  quantity: number;
  unit_price_minor: number;
}

export interface CalculatedLineItem extends RawLineItemInput {
  amount_minor: number;
  position: number;
}

export interface EstimateFinancials {
  subtotal_minor: number;
  discount_rate_basis_points: number;
  discount_minor: number;
  tax_rate_basis_points: number;
  tax_minor: number;
  total_minor: number;
  calculatedItems: CalculatedLineItem[];
}

export interface CreateEstimateInput {
  title: string;
  projectId?: string | null;
  currency?: string;
  validUntil?: string | null;
  notes?: string | null;
  terms?: string | null;
  discountRateBasisPoints?: number;
  taxRateBasisPoints?: number;
  lineItems: RawLineItemInput[];
  idempotencyKey?: string | null;
}

export interface UpdateEstimateInput {
  title?: string;
  projectId?: string | null;
  currency?: string;
  validUntil?: string | null;
  notes?: string | null;
  terms?: string | null;
  discountRateBasisPoints?: number;
  taxRateBasisPoints?: number;
  lineItems?: RawLineItemInput[];
}

export interface EstimateWithLineItems extends Estimate {
  line_items: EstimateLineItem[];
  project?: { id: string; name: string } | null;
  created_by_user?: { id: string; name: string; email: string } | null;
}

/**
 * Pure calculation function for deterministic, float-safe financial math
 */
export function calculateEstimateFinancials(
  items: RawLineItemInput[],
  discountRateBasisPoints: number = 0,
  taxRateBasisPoints: number = 0,
): EstimateFinancials {
  if (!items || items.length === 0) {
    throw new Error('Estimate must have at least one line item');
  }

  // Validate basis points (0 to 10000 -> 0.00% to 100.00%)
  const discountBps = Math.min(Math.max(0, Math.floor(discountRateBasisPoints || 0)), 10000);
  const taxBps = Math.min(Math.max(0, Math.floor(taxRateBasisPoints || 0)), 10000);

  let subtotal = 0;
  const calculatedItems: CalculatedLineItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity);
    const unitPrice = Math.floor(Number(item.unit_price_minor));

    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Line item #${i + 1} quantity must be greater than 0`);
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new Error(`Line item #${i + 1} unit price cannot be negative`);
    }

    // Multiply quantity with minor unit and round cleanly
    const itemAmount = Math.round(qty * unitPrice);
    subtotal += itemAmount;

    calculatedItems.push({
      description: item.description?.trim() || `Item ${i + 1}`,
      quantity: qty,
      unit_price_minor: unitPrice,
      amount_minor: itemAmount,
      position: i,
    });
  }

  // Discount calculation
  const discountMinor = Math.round((subtotal * discountBps) / 10000);
  const taxableAmount = Math.max(0, subtotal - discountMinor);

  // Tax calculation
  const taxMinor = Math.round((taxableAmount * taxBps) / 10000);

  // Grand total
  const totalMinor = taxableAmount + taxMinor;

  return {
    subtotal_minor: subtotal,
    discount_rate_basis_points: discountBps,
    discount_minor: discountMinor,
    tax_rate_basis_points: taxBps,
    tax_minor: taxMinor,
    total_minor: totalMinor,
    calculatedItems,
  };
}

/**
 * Format minor units into human readable currency display (e.g. 150000 -> "$1,500.00")
 */
export function formatMinorUnits(amountMinor: number, currency: string = 'USD'): string {
  const amount = (amountMinor || 0) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

export class EstimatesService {
  /**
   * Generate next sequential estimate number for an account
   * e.g. EST-2026-0001
   */
  async generateEstimateNumber(accountId: string, supabase: AppSupabaseClient): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `EST-${currentYear}-`;

    const { count, error } = await supabase
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    if (error) {
      logger.error('Failed to count estimates for numbering', { accountId }, error);
    }

    const nextSeq = (count || 0) + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * List estimates for an account with optional status filtering
   */
  async getEstimates(
    accountId: string,
    options: {
      status?: EstimateStatus;
      projectId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
    supabase: AppSupabaseClient,
  ): Promise<{ data: EstimateWithLineItems[]; count: number }> {
    let query = supabase
      .from('estimates')
      .select(
        `
        *,
        line_items:estimate_line_items(*),
        project:projects(id, name),
        created_by_user:user_profiles!created_by(id, name, email)
      `,
        { count: 'exact' },
      )
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.projectId) {
      query = query.eq('project_id', options.projectId);
    }
    if (options.search) {
      query = query.or(
        `title.ilike.%${options.search}%,estimate_number.ilike.%${options.search}%`,
      );
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('Error fetching estimates', { accountId, options }, error);
      throw new Error(`Failed to fetch estimates: ${error.message}`);
    }

    return {
      data: (data || []) as unknown as EstimateWithLineItems[],
      count: count || 0,
    };
  }

  /**
   * Get a single estimate by ID with tenant validation
   */
  async getEstimateById(
    accountId: string,
    estimateId: string,
    supabase: AppSupabaseClient,
  ): Promise<EstimateWithLineItems | null> {
    const { data, error } = await supabase
      .from('estimates')
      .select(
        `
        *,
        line_items:estimate_line_items(*),
        project:projects(id, name),
        created_by_user:user_profiles!created_by(id, name, email)
      `,
      )
      .eq('id', estimateId)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching estimate by id', { accountId, estimateId }, error);
      throw new Error(`Failed to fetch estimate: ${error.message}`);
    }

    if (!data) return null;

    // Sort line items by position
    if (data.line_items && Array.isArray(data.line_items)) {
      data.line_items.sort((a: any, b: any) => a.position - b.position);
    }

    return data as unknown as EstimateWithLineItems;
  }

  /**
   * Create an estimate with Idempotency check and server-side calculated totals
   */
  async createEstimate(
    accountId: string,
    input: CreateEstimateInput,
    userId: string | null,
    supabase: AppSupabaseClient,
  ): Promise<{ estimate: EstimateWithLineItems; isDuplicate: boolean }> {
    // 1. Idempotency Check
    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from('estimates')
        .select('id')
        .eq('account_id', accountId)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();

      if (existing) {
        logger.info('Idempotent request matched existing estimate', {
          accountId,
          estimateId: existing.id,
          idempotencyKey: input.idempotencyKey,
        });
        const existingFull = await this.getEstimateById(accountId, existing.id, supabase);
        if (existingFull) {
          return { estimate: existingFull, isDuplicate: true };
        }
      }
    }

    // 2. Perform server-side calculation
    const financials = calculateEstimateFinancials(
      input.lineItems,
      input.discountRateBasisPoints,
      input.taxRateBasisPoints,
    );

    // 3. Generate estimate number
    const estimateNumber = await this.generateEstimateNumber(accountId, supabase);

    // 4. Insert into estimates table
    const { data: newEstimate, error: insertError } = await supabase
      .from('estimates')
      .insert({
        account_id: accountId,
        project_id: input.projectId || null,
        estimate_number: estimateNumber,
        title: input.title.trim(),
        status: 'draft',
        currency: (input.currency || 'USD').toUpperCase(),
        subtotal_minor: financials.subtotal_minor,
        discount_rate_basis_points: financials.discount_rate_basis_points,
        discount_minor: financials.discount_minor,
        tax_rate_basis_points: financials.tax_rate_basis_points,
        tax_minor: financials.tax_minor,
        total_minor: financials.total_minor,
        notes: input.notes?.trim() || null,
        terms: input.terms?.trim() || null,
        valid_until: input.validUntil || null,
        created_by: userId,
        idempotency_key: input.idempotencyKey || null,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to insert estimate', { accountId, input }, insertError);
      throw new Error(`Failed to create estimate: ${insertError.message}`);
    }

    // 5. Insert line items
    const lineItemRows = financials.calculatedItems.map((item) => ({
      estimate_id: newEstimate.id,
      account_id: accountId,
      description: item.description,
      quantity: item.quantity,
      unit_price_minor: item.unit_price_minor,
      amount_minor: item.amount_minor,
      position: item.position,
    }));

    const { error: lineItemError } = await supabase
      .from('estimate_line_items')
      .insert(lineItemRows);

    if (lineItemError) {
      logger.error('Failed to insert line items', { estimateId: newEstimate.id }, lineItemError);
      // Soft cleanup to preserve consistency
      await supabase.from('estimates').delete().eq('id', newEstimate.id);
      throw new Error(`Failed to create line items: ${lineItemError.message}`);
    }

    const fullEstimate = await this.getEstimateById(accountId, newEstimate.id, supabase);
    if (!fullEstimate) {
      throw new Error('Failed to retrieve newly created estimate');
    }

    return { estimate: fullEstimate, isDuplicate: false };
  }

  /**
   * Update an existing draft estimate
   * (Estimates in sent, accepted, or rejected state cannot have line items modified)
   */
  async updateEstimate(
    accountId: string,
    estimateId: string,
    input: UpdateEstimateInput,
    supabase: AppSupabaseClient,
  ): Promise<EstimateWithLineItems> {
    const existing = await this.getEstimateById(accountId, estimateId, supabase);
    if (!existing) {
      throw new Error('Estimate not found');
    }

    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot edit estimate in "${existing.status}" status. Only draft estimates can be edited.`,
      );
    }

    // Prepare financials if line items or rates updated
    const lineItemsToUse = input.lineItems || existing.line_items;
    const discountBps =
      input.discountRateBasisPoints !== undefined
        ? input.discountRateBasisPoints
        : existing.discount_rate_basis_points;
    const taxBps =
      input.taxRateBasisPoints !== undefined
        ? input.taxRateBasisPoints
        : existing.tax_rate_basis_points;

    const financials = calculateEstimateFinancials(lineItemsToUse, discountBps, taxBps);

    // Update estimate row
    const { error: updateError } = await supabase
      .from('estimates')
      .update({
        title: input.title !== undefined ? input.title.trim() : existing.title,
        project_id: input.projectId !== undefined ? input.projectId : existing.project_id,
        currency: input.currency !== undefined ? input.currency.toUpperCase() : existing.currency,
        subtotal_minor: financials.subtotal_minor,
        discount_rate_basis_points: financials.discount_rate_basis_points,
        discount_minor: financials.discount_minor,
        tax_rate_basis_points: financials.tax_rate_basis_points,
        tax_minor: financials.tax_minor,
        total_minor: financials.total_minor,
        notes: input.notes !== undefined ? input.notes?.trim() : existing.notes,
        terms: input.terms !== undefined ? input.terms?.trim() : existing.terms,
        valid_until: input.validUntil !== undefined ? input.validUntil : existing.valid_until,
      })
      .eq('id', estimateId)
      .eq('account_id', accountId);

    if (updateError) {
      logger.error('Failed to update estimate', { accountId, estimateId }, updateError);
      throw new Error(`Failed to update estimate: ${updateError.message}`);
    }

    // Replace line items if new ones provided
    if (input.lineItems) {
      // Delete old line items
      await supabase.from('estimate_line_items').delete().eq('estimate_id', estimateId);

      // Insert fresh calculated line items
      const lineItemRows = financials.calculatedItems.map((item) => ({
        estimate_id: estimateId,
        account_id: accountId,
        description: item.description,
        quantity: item.quantity,
        unit_price_minor: item.unit_price_minor,
        amount_minor: item.amount_minor,
        position: item.position,
      }));

      const { error: lineItemError } = await supabase
        .from('estimate_line_items')
        .insert(lineItemRows);

      if (lineItemError) {
        logger.error('Failed to update line items', { estimateId }, lineItemError);
        throw new Error(`Failed to update line items: ${lineItemError.message}`);
      }
    }

    const updated = await this.getEstimateById(accountId, estimateId, supabase);
    if (!updated) {
      throw new Error('Failed to retrieve updated estimate');
    }
    return updated;
  }

  /**
   * Transition lifecycle state: draft -> sent -> accepted | rejected
   */
  async transitionStatus(
    accountId: string,
    estimateId: string,
    newStatus: EstimateStatus,
    reason?: string,
    supabase?: AppSupabaseClient,
  ): Promise<EstimateWithLineItems> {
    if (!supabase) throw new Error('Supabase client is required');

    const estimate = await this.getEstimateById(accountId, estimateId, supabase);
    if (!estimate) {
      throw new Error('Estimate not found');
    }

    const currentStatus = estimate.status;

    // Validate lifecycle transitions
    if (currentStatus === 'draft') {
      if (newStatus !== 'sent') {
        throw new Error(`Cannot transition draft estimate directly to "${newStatus}". Must be "sent" first.`);
      }
    } else if (currentStatus === 'sent') {
      if (newStatus !== 'accepted' && newStatus !== 'rejected' && newStatus !== 'draft') {
        throw new Error(
          `Sent estimate can only transition to "accepted", "rejected", or returned to "draft". Received "${newStatus}".`,
        );
      }
    } else if (currentStatus === 'accepted' || currentStatus === 'rejected') {
      throw new Error(
        `Estimate is already finalized as "${currentStatus}" and cannot be changed.`,
      );
    }

    const updatePayload: Record<string, any> = {
      status: newStatus,
    };

    const now = new Date().toISOString();
    if (newStatus === 'sent') {
      updatePayload.sent_at = now;
    } else if (newStatus === 'accepted') {
      updatePayload.accepted_at = now;
    } else if (newStatus === 'rejected') {
      updatePayload.rejected_at = now;
      updatePayload.rejection_reason = reason?.trim() || null;
    }

    const { error } = await supabase
      .from('estimates')
      .update(updatePayload)
      .eq('id', estimateId)
      .eq('account_id', accountId);

    if (error) {
      logger.error('Failed to transition estimate status', { accountId, estimateId, newStatus }, error);
      throw new Error(`Failed to transition estimate status: ${error.message}`);
    }

    const updated = await this.getEstimateById(accountId, estimateId, supabase);
    return updated!;
  }
}

export const estimatesService = new EstimatesService();
