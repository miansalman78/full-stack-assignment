'use client';

// Account list component for displaying user-accessible accounts
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Building2, Calendar, ArrowRight, Mail, Receipt } from 'lucide-react';
import { Account } from '@/lib/account-service';
import { UserWithRoles, isSuperadmin, hasPermission } from '@/lib/rbac';
import { Permission } from '@/lib/permissions';
import { format } from 'date-fns';
import { AccountCreateDialog } from '@/components/account-create-dialog';

interface AccountListProps {
  accounts: Account[];
  userProfile: UserWithRoles;
  onAccountCreated?: () => void;
}

export function AccountList({ accounts, userProfile, onAccountCreated }: AccountListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [canCreateAccount, setCanCreateAccount] = useState(false);
  const [hasManageAccountsPermission, setHasManageAccountsPermission] = useState(false);
  // Accounts are pre-filtered by the server page component — trust the passed data
  const [visibleAccounts, setVisibleAccounts] = useState<Account[]>(accounts);

  // Check permissions for UI controls (create button, manage actions)
  useEffect(() => {
    if (!userProfile) return;

    async function checkPermissions() {
      const canManage = await hasPermission(userProfile, Permission.MANAGE_ACCOUNTS);
      setCanCreateAccount(canManage);
      setHasManageAccountsPermission(canManage);
    }

    void checkPermissions();
  }, [userProfile]);

  // Update visible accounts when props change
  useEffect(() => {
    setVisibleAccounts(accounts);
  }, [accounts]);

  const filteredAccounts = visibleAccounts.filter(
    (account: any) =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.primary_contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatStatus = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'In Progress';
      case 'active':
        return 'Active';
      case 'planning':
        return 'Planning';
      case 'complete':
        return 'Complete';
      case 'review':
        return 'Review';
      case 'on_hold':
        return 'On Hold';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'complete':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'in_progress':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'planning':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'suspended':
      case 'on_hold':
        return 'bg-red-500/10 text-destructive border border-red-500/20';
      default:
        return 'bg-muted text-foreground';
    }
  };

  if (visibleAccounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>No Accounts Found</span>
          </CardTitle>
          <CardDescription>
            {isSuperadmin(userProfile)
              ? 'Get started by creating your first client account'
              : hasManageAccountsPermission
                ? 'No accounts have been created yet. Contact a superadmin to create accounts.'
                : "You don't have access to any accounts yet. Contact your administrator to be assigned to an account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <Building2 className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <h3 className="text-foreground mb-2 text-lg font-medium">
              {isSuperadmin(userProfile)
                ? 'No accounts yet'
                : hasManageAccountsPermission
                  ? 'No accounts available'
                  : 'No account access'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {isSuperadmin(userProfile)
                ? 'Create your first client account to start managing projects and relationships.'
                : hasManageAccountsPermission
                  ? 'No accounts have been created yet. Contact a superadmin to create accounts.'
                  : 'You need to be assigned to an account to view and manage projects. Please contact your administrator.'}
            </p>
            {canCreateAccount && (
              <AccountCreateDialog userProfile={userProfile} onAccountCreated={onAccountCreated} />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters - Responsive */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="max-w-md flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
              className="border-input focus:ring-ring bg-background text-foreground w-full rounded-md border py-2 pr-4 pl-10 focus:border-transparent focus:ring-2"
            />
            <Users className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          </div>
        </div>
        {canCreateAccount && (
          <div className="w-full sm:w-auto">
            <AccountCreateDialog userProfile={userProfile} onAccountCreated={onAccountCreated} />
          </div>
        )}
      </div>

      {/* Accounts Grid - Responsive */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {filteredAccounts.map((account: any) => (
          <Card
            key={account.id}
            className="h-full flex flex-col justify-between overflow-hidden border border-border/70 bg-[var(--surface-2)] transition-all duration-200 hover:border-primary/40 hover:shadow-lg min-w-0"
          >
            <CardHeader className="pb-3 space-y-0">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <CardTitle
                    className="text-foreground truncate text-base font-bold sm:text-lg"
                    title={account.name}
                  >
                    {account.name}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground mt-1 line-clamp-2 text-xs sm:text-sm">
                    {account.description || 'No description provided'}
                  </CardDescription>
                </div>
                <Badge
                  className={`${getStatusColor(account.status)} shrink-0 text-[11px] font-medium whitespace-nowrap px-2 py-0.5 rounded-full`}
                >
                  {formatStatus(account.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between space-y-4 pt-1">
              <div className="space-y-3">
                {/* Contact Information */}
                {account.primary_contact_name && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span>Primary Contact</span>
                    </div>
                    <div className="pl-5">
                      <p className="text-foreground text-xs sm:text-sm font-medium truncate">
                        {account.primary_contact_name}
                      </p>
                      {account.primary_contact_email && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Mail className="text-muted-foreground h-3 w-3 shrink-0" />
                          <span className="text-muted-foreground text-[11px] truncate">
                            {account.primary_contact_email}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>Created</span>
                  </div>
                  <div className="pl-5">
                    <p className="text-muted-foreground text-xs">
                      {format(new Date(account.created_at), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-border/60 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/accounts/${account.id}`} className="min-w-0 w-full block">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center gap-1 px-2 text-xs font-medium hover:bg-muted/80 h-9"
                    >
                      <span className="truncate">View Details</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </Button>
                  </Link>
                  <Link href={`/accounts/${account.id}/estimates`} className="min-w-0 w-full block">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center gap-1 px-2 text-xs font-medium hover:bg-secondary/80 h-9 text-foreground"
                      title="Revenue & Billing Estimates"
                    >
                      <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate">Estimates</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* No Results */}
      {filteredAccounts.length === 0 && searchTerm && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <h3 className="text-foreground mb-2 text-lg font-medium">No accounts found</h3>
            <p className="text-muted-foreground mb-4">
              No accounts match your search for &quot;{searchTerm}&quot;
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
              }}
            >
              Clear Search
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
