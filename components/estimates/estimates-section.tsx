'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Receipt,
  Send,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  DollarSign,
  AlertCircle,
  FolderKanban,
  Eye,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EstimateWithLineItems, formatMinorUnits } from '@/lib/estimates-service';
import { EstimateStatus } from '@/lib/supabase';
import { CreateEstimateDialog } from './create-estimate-dialog';
import { UserWithRoles, hasPermission } from '@/lib/rbac';
import { Permission } from '@/lib/permissions';

interface EstimatesSectionProps {
  accountId: string;
  userProfile?: UserWithRoles;
  projects?: Array<{ id: string; name: string }>;
}

export function EstimatesSection({ accountId, userProfile, projects = [] }: EstimatesSectionProps) {
  const [estimates, setEstimates] = useState<EstimateWithLineItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | EstimateStatus>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<EstimateWithLineItems | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Permission checks
  const [canCreate, setCanCreate] = useState(false);
  const [canSend, setCanSend] = useState(false);

  const checkUserPermissions = useCallback(async () => {
    if (!userProfile) return;
    const [createPerm, sendPerm] = await Promise.all([
      hasPermission(userProfile, Permission.ESTIMATES_CREATE, { accountId }),
      hasPermission(userProfile, Permission.ESTIMATES_SEND, { accountId }),
    ]);
    setCanCreate(createPerm);
    setCanSend(sendPerm);
  }, [userProfile, accountId]);

  const loadEstimates = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        activeTab === 'all'
          ? `/api/accounts/${accountId}/estimates`
          : `/api/accounts/${accountId}/estimates?status=${activeTab}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load estimates');
      }
      const data = await res.json();
      setEstimates(data.estimates || []);
    } catch (err: any) {
      toast.error(err.message || 'Error fetching estimates');
      setEstimates([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, activeTab]);

  useEffect(() => {
    checkUserPermissions();
  }, [checkUserPermissions]);

  useEffect(() => {
    loadEstimates();
  }, [loadEstimates]);

  const handleStatusTransition = async (estimateId: string, newStatus: EstimateStatus) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/estimates/${estimateId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status');
      }

      toast.success(
        newStatus === 'sent'
          ? 'Estimate successfully sent to client!'
          : `Estimate status updated to ${newStatus}`,
      );

      setSelectedEstimate(data.estimate);
      loadEstimates();
    } catch (err: any) {
      toast.error(err.message || 'Error updating status');
    } finally {
      setActionLoading(false);
    }
  };

  // Metrics summary
  const metrics = {
    totalValue: estimates.reduce((acc, e) => acc + (e.total_minor || 0), 0),
    draftCount: estimates.filter((e) => e.status === 'draft').length,
    sentCount: estimates.filter((e) => e.status === 'sent').length,
    acceptedValue: estimates
      .filter((e) => e.status === 'accepted')
      .reduce((acc, e) => acc + (e.total_minor || 0), 0),
  };

  const getStatusBadge = (status: EstimateStatus) => {
    switch (status) {
      case 'draft':
        return (
          <Badge variant="secondary" className="gap-1 font-mono text-xs">
            <Clock className="h-3 w-3" /> Draft
          </Badge>
        );
      case 'sent':
        return (
          <Badge className="bg-blue-600/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 gap-1 font-mono text-xs">
            <Send className="h-3 w-3" /> Sent
          </Badge>
        );
      case 'accepted':
        return (
          <Badge className="bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 gap-1 font-mono text-xs">
            <CheckCircle2 className="h-3 w-3" /> Accepted
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="gap-1 font-mono text-xs">
            <XCircle className="h-3 w-3" /> Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Revenue & Billing: Estimates</CardTitle>
                <CardDescription>
                  Account-scoped financial estimates stored in minor units with auditable lifecycle tracking.
                </CardDescription>
              </div>
            </div>
          </div>

          {canCreate && (
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="gap-2 shadow-sm font-medium"
            >
              <Plus className="h-4 w-4" /> New Estimate
            </Button>
          )}
        </div>

        {/* Micro-metrics cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
          <div className="p-3 bg-muted/40 rounded-lg border">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-primary" /> Total Pipeline
            </div>
            <div className="text-lg font-bold font-mono mt-1">
              {formatMinorUnits(metrics.totalValue)}
            </div>
          </div>
          <div className="p-3 bg-muted/40 rounded-lg border">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-amber-500" /> Drafts
            </div>
            <div className="text-lg font-bold font-mono mt-1">{metrics.draftCount}</div>
          </div>
          <div className="p-3 bg-muted/40 rounded-lg border">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Send className="h-3.5 w-3.5 text-blue-500" /> Awaiting Client
            </div>
            <div className="text-lg font-bold font-mono mt-1">{metrics.sentCount}</div>
          </div>
          <div className="p-3 bg-muted/40 rounded-lg border">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Won / Accepted
            </div>
            <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {formatMinorUnits(metrics.acceptedValue)}
            </div>
          </div>
        </div>

        {/* Status Filters */}
        <div className="pt-2">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="w-full"
          >
            <TabsList className="grid grid-cols-5 w-full sm:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-2"></div>
            <p>Loading estimates...</p>
          </div>
        ) : estimates.length === 0 ? (
          <div className="py-12 text-center border rounded-xl bg-muted/10">
            <Receipt className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
            <h4 className="font-semibold text-base">No estimates found</h4>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
              {activeTab === 'all'
                ? 'Create a draft estimate to define scope, deliverables, and costs for this account.'
                : `No estimates currently in "${activeTab}" status.`}
            </p>
            {canCreate && activeTab === 'all' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
                className="mt-4 gap-2"
              >
                <Plus className="h-4 w-4" /> Create First Estimate
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-semibold">Estimate #</TableHead>
                  <TableHead className="font-semibold">Title</TableHead>
                  <TableHead className="font-semibold">Project</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-right">Total Amount</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimates.map((est) => (
                  <TableRow
                    key={est.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedEstimate(est)}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {est.estimate_number}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{est.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {est.created_at ? format(new Date(est.created_at), 'MMM d, yyyy') : '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {est.project?.name ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{est.project.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Unlinked</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(est.status)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm">
                      {formatMinorUnits(est.total_minor, est.currency)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEstimate(est)}
                        className="gap-1.5 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <CreateEstimateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        accountId={accountId}
        projects={projects}
        onEstimateCreated={loadEstimates}
      />

      {/* Estimate Preview & Details Modal */}
      {selectedEstimate && (
        <Dialog open={!!selectedEstimate} onOpenChange={(open) => !open && setSelectedEstimate(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary">
                      {selectedEstimate.estimate_number}
                    </span>
                    {getStatusBadge(selectedEstimate.status)}
                  </div>
                  <DialogTitle className="text-xl font-bold mt-1">
                    {selectedEstimate.title}
                  </DialogTitle>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Grand Total</div>
                  <div className="font-mono text-2xl font-extrabold text-primary">
                    {formatMinorUnits(selectedEstimate.total_minor, selectedEstimate.currency)}
                  </div>
                </div>
              </div>

              {/* Meta details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    Created:{' '}
                    {selectedEstimate.created_at
                      ? format(new Date(selectedEstimate.created_at), 'MMM d, yyyy')
                      : '—'}
                  </span>
                </div>
                {selectedEstimate.valid_until && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Valid until: {selectedEstimate.valid_until}</span>
                  </div>
                )}
                {selectedEstimate.project?.name && (
                  <div className="flex items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5" />
                    <span>Project: {selectedEstimate.project.name}</span>
                  </div>
                )}
              </div>
            </DialogHeader>

            {/* Line items table */}
            <div className="space-y-4 py-2">
              <h4 className="font-semibold text-sm">Line Items Breakdown</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="text-xs">
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedEstimate.line_items?.map((item) => (
                      <TableRow key={item.id} className="text-sm">
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatMinorUnits(item.unit_price_minor, selectedEstimate.currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatMinorUnits(item.amount_minor, selectedEstimate.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Summary Calculations */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatMinorUnits(selectedEstimate.subtotal_minor, selectedEstimate.currency)}
                    </span>
                  </div>
                  {selectedEstimate.discount_minor > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Discount ({selectedEstimate.discount_rate_basis_points / 100}%):</span>
                      <span className="font-mono font-medium">
                        -{formatMinorUnits(selectedEstimate.discount_minor, selectedEstimate.currency)}
                      </span>
                    </div>
                  )}
                  {selectedEstimate.tax_minor > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax ({selectedEstimate.tax_rate_basis_points / 100}%):</span>
                      <span className="font-mono font-medium text-foreground">
                        +{formatMinorUnits(selectedEstimate.tax_minor, selectedEstimate.currency)}
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-bold text-base">
                    <span>Total:</span>
                    <span className="font-mono text-primary">
                      {formatMinorUnits(selectedEstimate.total_minor, selectedEstimate.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              {(selectedEstimate.notes || selectedEstimate.terms) && (
                <div className="border-t pt-3 space-y-2 text-xs">
                  {selectedEstimate.notes && (
                    <div>
                      <span className="font-semibold text-muted-foreground">Notes: </span>
                      <span>{selectedEstimate.notes}</span>
                    </div>
                  )}
                  {selectedEstimate.terms && (
                    <div>
                      <span className="font-semibold text-muted-foreground">Terms: </span>
                      <span>{selectedEstimate.terms}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="border-t pt-4 gap-2">
              <Button variant="outline" onClick={() => setSelectedEstimate(null)}>
                Close
              </Button>

              {/* Lifecycle Actions */}
              {canSend && selectedEstimate.status === 'draft' && (
                <Button
                  onClick={() => handleStatusTransition(selectedEstimate.id, 'sent')}
                  disabled={actionLoading}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Send className="h-4 w-4" />
                  {actionLoading ? 'Sending...' : 'Send Estimate to Client'}
                </Button>
              )}

              {canSend && selectedEstimate.status === 'sent' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 gap-1.5"
                    onClick={() => handleStatusTransition(selectedEstimate.id, 'rejected')}
                    disabled={actionLoading}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={() => handleStatusTransition(selectedEstimate.id, 'accepted')}
                    disabled={actionLoading}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Accept
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
