'use client';

import { useState, useId, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Calculator, Receipt, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatMinorUnits } from '@/lib/estimates-service';

export interface LineItemDraft {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number; // in normal currency units (e.g. 150.50)
}

interface ProjectOption {
  id: string;
  name: string;
}

interface CreateEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  projects?: ProjectOption[];
  onEstimateCreated?: () => void;
}

export function CreateEstimateDialog({
  open,
  onOpenChange,
  accountId,
  projects = [],
  onEstimateCreated,
}: CreateEstimateDialogProps) {
  const formId = useId();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('none');
  const [validUntil, setValidUntil] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Payment due within 30 days of acceptance.');

  const [lineItems, setLineItems] = useState<LineItemDraft[]>([
    { id: '1', description: 'Professional Services', quantity: 1, unitPrice: 0 },
  ]);

  // Live calculation of preview numbers
  const calculation = useMemo(() => {
    let subtotalCents = 0;
    const items = lineItems.map((item) => {
      const qty = Number(item.quantity) || 0;
      const unitCents = Math.round((Number(item.unitPrice) || 0) * 100);
      const amountCents = Math.round(qty * unitCents);
      subtotalCents += amountCents;
      return {
        ...item,
        amountCents,
      };
    });

    const discountBps = Math.min(Math.max(0, Math.round(discountPercent * 100)), 10000);
    const taxBps = Math.min(Math.max(0, Math.round(taxPercent * 100)), 10000);

    const discountCents = Math.round((subtotalCents * discountBps) / 10000);
    const taxableCents = Math.max(0, subtotalCents - discountCents);
    const taxCents = Math.round((taxableCents * taxBps) / 10000);
    const totalCents = taxableCents + taxCents;

    return {
      items,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
    };
  }, [lineItems, discountPercent, taxPercent]);

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        description: '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) {
      toast.error('An estimate must contain at least one line item');
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItemDraft, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Please provide an estimate title');
      return;
    }

    if (lineItems.length === 0) {
      toast.error('Please add at least one line item');
      return;
    }

    for (let i = 0; i < lineItems.length; i++) {
      const it = lineItems[i];
      if (!it.description.trim()) {
        toast.error(`Line item #${i + 1} requires a description`);
        return;
      }
      if (Number(it.quantity) <= 0) {
        toast.error(`Line item #${i + 1} quantity must be greater than 0`);
        return;
      }
      if (Number(it.unitPrice) < 0) {
        toast.error(`Line item #${i + 1} unit price cannot be negative`);
        return;
      }
    }

    setLoading(true);

    try {
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`;

      // Convert unit prices into integer minor units (cents)
      const payload = {
        title: title.trim(),
        project_id: selectedProjectId === 'none' ? null : selectedProjectId,
        currency,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        discount_rate_basis_points: Math.round((Number(discountPercent) || 0) * 100),
        tax_rate_basis_points: Math.round((Number(taxPercent) || 0) * 100),
        idempotency_key: idempotencyKey,
        line_items: lineItems.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit_price_minor: Math.round(Number(item.unitPrice) * 100),
        })),
      };

      const res = await fetch(`/api/accounts/${accountId}/estimates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create estimate');
      }

      toast.success(
        data.isDuplicate
          ? 'Existing estimate returned (Idempotent replay)'
          : `Estimate ${data.estimate.estimate_number} created as draft!`,
      );

      // Reset form
      setTitle('');
      setSelectedProjectId('none');
      setValidUntil('');
      setNotes('');
      setDiscountPercent(0);
      setTaxPercent(0);
      setLineItems([{ id: '1', description: 'Professional Services', quantity: 1, unitPrice: 0 }]);

      onOpenChange(false);
      onEstimateCreated?.();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">New Estimate Draft</DialogTitle>
              <DialogDescription>
                Create a scoped draft estimate with server-validated minor unit financial calculations.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Main Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title" className="font-semibold text-sm">
                Estimate Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. Mobile App Redesign & API Integration"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project" className="font-semibold text-sm">
                Link to Project (Optional)
              </Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="validUntil" className="font-semibold text-sm">
                Valid Until
              </Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          {/* Dynamic Line Items Section */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" /> Line Items
                </h4>
                <p className="text-xs text-muted-foreground">
                  Amounts are calculated in integer minor units to guarantee 100% precision.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </Button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => {
                const rowAmountCents = Math.round(
                  (Number(item.quantity) || 0) * Math.round((Number(item.unitPrice) || 0) * 100),
                );

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="col-span-12 sm:col-span-5 space-y-1">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Input
                        placeholder="Service or deliverable description"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        required
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0.0001"
                        value={item.quantity}
                        onChange={(e) =>
                          updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                        }
                        required
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)
                        }
                        required
                      />
                    </div>

                    <div className="col-span-3 sm:col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Line Total</Label>
                      <div className="h-9 px-3 flex items-center bg-muted/60 rounded-md font-mono text-sm font-medium">
                        {formatMinorUnits(rowAmountCents, currency)}
                      </div>
                    </div>

                    <div className="col-span-1 flex justify-center pb-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rates and Financial Summary Box */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 border-t pt-4">
            <div className="md:col-span-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="discount" className="text-xs font-medium">
                    Discount Rate (%)
                  </Label>
                  <Input
                    id="discount"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tax" className="text-xs font-medium">
                    Tax Rate (%)
                  </Label>
                  <Input
                    id="tax"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs font-medium">
                  Client Notes
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Optional details or scope breakdown"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Calculations Overview */}
            <div className="md:col-span-6 flex flex-col justify-between p-4 rounded-xl bg-muted/40 border">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium text-foreground">
                    {formatMinorUnits(calculation.subtotalCents, currency)}
                  </span>
                </div>
                {calculation.discountCents > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount ({discountPercent}%):</span>
                    <span className="font-mono font-medium">
                      -{formatMinorUnits(calculation.discountCents, currency)}
                    </span>
                  </div>
                )}
                {calculation.taxCents > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax ({taxPercent}%):</span>
                    <span className="font-mono font-medium text-foreground">
                      +{formatMinorUnits(calculation.taxCents, currency)}
                    </span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between items-baseline font-bold text-base sm:text-lg">
                  <span>Grand Total:</span>
                  <span className="font-mono text-primary text-xl">
                    {formatMinorUnits(calculation.totalCents, currency)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Client data is recalculated and verified on the server upon submission.</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? 'Creating Draft...' : 'Create Draft Estimate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
