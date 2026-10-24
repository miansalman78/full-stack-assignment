import { describe, it, expect } from 'vitest';
import {
  calculateEstimateFinancials,
  formatMinorUnits,
  RawLineItemInput,
} from '@/lib/estimates-service';

describe('Estimates Financial Calculations (Minor Units Engine)', () => {
  it('correctly calculates line items in minor units (cents) without floating-point inaccuracy', () => {
    const items: RawLineItemInput[] = [
      {
        description: 'Frontend Architecture Review',
        quantity: 10,
        unit_price_minor: 15000, // $150.00
      },
      {
        description: 'Backend API Implementation',
        quantity: 2.5,
        unit_price_minor: 20000, // $200.00
      },
    ];

    const result = calculateEstimateFinancials(items, 0, 0);

    // 10 * 15000 = 150000 ($1500.00)
    // 2.5 * 20000 = 50000 ($500.00)
    // Subtotal: 200000 ($2000.00)
    expect(result.subtotal_minor).toBe(200000);
    expect(result.discount_minor).toBe(0);
    expect(result.tax_minor).toBe(0);
    expect(result.total_minor).toBe(200000);
    expect(result.calculatedItems).toHaveLength(2);
    expect(result.calculatedItems[0].amount_minor).toBe(150000);
    expect(result.calculatedItems[1].amount_minor).toBe(50000);
  });

  it('correctly computes discounts and taxes using integer basis points', () => {
    const items: RawLineItemInput[] = [
      {
        description: 'Cloud Infrastructure Setup',
        quantity: 1,
        unit_price_minor: 100000, // $1,000.00
      },
    ];

    // 10% discount (1000 basis points)
    // 8.25% tax (825 basis points)
    const result = calculateEstimateFinancials(items, 1000, 825);

    // Subtotal: 100,000 cents ($1,000.00)
    // Discount: 10% of 100,000 = 10,000 cents ($100.00)
    // Taxable Amount: 90,000 cents ($900.00)
    // Tax: 8.25% of 90,000 = Math.round(90000 * 825 / 10000) = 7425 cents ($74.25)
    // Grand Total: 90,000 + 7,425 = 97,425 cents ($974.25)
    expect(result.subtotal_minor).toBe(100000);
    expect(result.discount_minor).toBe(10000);
    expect(result.tax_minor).toBe(7425);
    expect(result.total_minor).toBe(97425);
  });

  it('safely clamps basis points between 0 and 10000 (0% to 100%)', () => {
    const items: RawLineItemInput[] = [
      { description: 'Consulting', quantity: 1, unit_price_minor: 50000 },
    ];

    // Over 100% basis points should be clamped to 10000 (100%)
    const result = calculateEstimateFinancials(items, 15000, 0);
    expect(result.discount_minor).toBe(50000);
    expect(result.total_minor).toBe(0);
  });

  it('rejects empty line items list', () => {
    expect(() => calculateEstimateFinancials([], 0, 0)).toThrow(
      'Estimate must have at least one line item',
    );
  });

  it('rejects invalid or non-positive quantities', () => {
    const items: RawLineItemInput[] = [
      { description: 'Testing', quantity: 0, unit_price_minor: 1000 },
    ];
    expect(() => calculateEstimateFinancials(items, 0, 0)).toThrow(
      'quantity must be greater than 0',
    );
  });

  it('rejects negative unit prices', () => {
    const items: RawLineItemInput[] = [
      { description: 'Testing', quantity: 2, unit_price_minor: -500 },
    ];
    expect(() => calculateEstimateFinancials(items, 0, 0)).toThrow(
      'unit price cannot be negative',
    );
  });
});

describe('Currency & Minor Unit Formatter', () => {
  it('formats minor units (cents) into USD currency string', () => {
    expect(formatMinorUnits(150000, 'USD')).toBe('$1,500.00');
    expect(formatMinorUnits(97425, 'USD')).toBe('$974.25');
    expect(formatMinorUnits(0, 'USD')).toBe('$0.00');
    expect(formatMinorUnits(99, 'USD')).toBe('$0.99');
  });
});

describe('Estimate State Machine & Lifecycle Rules', () => {
  // Pure logic check for state machine rules
  const validateTransition = (current: string, next: string): boolean => {
    if (current === 'draft') return next === 'sent';
    if (current === 'sent') return next === 'accepted' || next === 'rejected' || next === 'draft';
    return false; // accepted and rejected are terminal
  };

  it('allows draft -> sent transition', () => {
    expect(validateTransition('draft', 'sent')).toBe(true);
  });

  it('prohibits draft directly to accepted or rejected without sending', () => {
    expect(validateTransition('draft', 'accepted')).toBe(false);
    expect(validateTransition('draft', 'rejected')).toBe(false);
  });

  it('allows sent -> accepted or rejected', () => {
    expect(validateTransition('sent', 'accepted')).toBe(true);
    expect(validateTransition('sent', 'rejected')).toBe(true);
  });

  it('prohibits changes once accepted or rejected (terminal state)', () => {
    expect(validateTransition('accepted', 'draft')).toBe(false);
    expect(validateTransition('accepted', 'sent')).toBe(false);
    expect(validateTransition('rejected', 'sent')).toBe(false);
  });
});
