import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserProfileServer } from '@/lib/auth-server';
import { hasPermission } from '@/lib/rbac';
import { Permission } from '@/lib/permissions';
import { createServerSupabase, createAdminSupabaseClient } from '@/lib/supabase-server';
import { EstimatesSection } from '@/components/estimates/estimates-section';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Home, ChevronRight } from 'lucide-react';

interface EstimatesPageProps {
  params: Promise<{
    accountId: string;
  }>;
}

export async function generateMetadata({ params }: EstimatesPageProps): Promise<Metadata> {
  const { accountId } = await params;
  const supabase = await createServerSupabase();
  if (!supabase) return { title: 'Estimates' };

  const { data: account } = await supabase
    .from('accounts')
    .select('name')
    .eq('id', accountId)
    .single();

  return {
    title: account?.name ? `Estimates — ${account.name}` : 'Estimates',
  };
}

export default async function EstimatesPage({ params }: EstimatesPageProps) {
  const { accountId } = await params;

  const userProfile = await getCurrentUserProfileServer();
  if (!userProfile) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please log in to view estimates.</p>
      </div>
    );
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold">Database Error</h1>
        <p className="text-muted-foreground mt-2">Unable to connect to database.</p>
      </div>
    );
  }

  // Tenant security: user must have ESTIMATES_READ for this account
  const canReadEstimates = await hasPermission(userProfile, Permission.ESTIMATES_READ, {
    accountId,
  });

  if (!canReadEstimates) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground mt-2">
          You don&apos;t have permission to view estimates for this account.
        </p>
      </div>
    );
  }

  const adminClient = createAdminSupabaseClient() || supabase;

  const [{ data: account }, { data: projects }] = await Promise.all([
    adminClient.from('accounts').select('id, name').eq('id', accountId).single(),
    adminClient.from('projects').select('id, name').eq('account_id', accountId),
  ]);

  if (!account) {
    notFound();
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <Link href="/accounts" className="hover:text-foreground transition-colors">
            Accounts
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <Link href={`/accounts/${accountId}`} className="hover:text-foreground transition-colors truncate max-w-[180px]">
            {account.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <span className="text-foreground font-medium">Estimates</span>
        </nav>

        <Link href={`/accounts/${accountId}`}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to {account.name}
          </Button>
        </Link>
      </div>

      <EstimatesSection
        accountId={accountId}
        userProfile={userProfile}
        projects={projects || []}
      />
    </div>
  );
}
