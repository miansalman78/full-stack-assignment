'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Home, ChevronRight } from 'lucide-react';
import { AccountList } from '@/components/account-list';
import { Account } from '@/lib/account-service';
import { UserWithRoles } from '@/lib/rbac';

interface AccountsClientWrapperProps {
  initialAccounts: Account[];
  userProfile: UserWithRoles;
  isAdminLevel: boolean;
}

export function AccountsClientWrapper({
  initialAccounts,
  userProfile,
  isAdminLevel,
}: AccountsClientWrapperProps) {
  const [accounts, _setAccounts] = useState(initialAccounts);

  const handleAccountCreated = () => {
    // Refresh the page to get updated accounts
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <span className="text-foreground font-medium">Accounts</span>
        </nav>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-foreground text-3xl sm:text-4xl font-bold tracking-tight">Accounts</h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
              {isAdminLevel
                ? 'Manage client accounts, revenue estimates, and projects'
                : 'View accounts you have access to, revenue estimates, and projects'}
            </p>
          </div>
        </div>
      </div>

      <AccountList
        accounts={accounts}
        userProfile={userProfile}
        onAccountCreated={handleAccountCreated}
      />
    </div>
  );
}
