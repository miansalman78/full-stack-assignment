# Kontrora — Staff Engineer Assignment (Revenue & Billing)

PSA platform (Next.js App Router + Supabase). Ship one revenue slice end-to-end in **2–3 hours**. Quality over completeness.

## Setup  

Node.js **20.9+**, free [Supabase](https://supabase.com) project.

```bash    
npm install
cp .env.local.template .env.local   # fill Supabase URL + keys
# Run supabase/schema.sql in the Supabase SQL Editor
npm run dev                        # http://localhost:3000
```

## Task   

Implement **Estimates** scoped to accounts:

1. Schema: estimates + line items — account-bound, amounts in minor units, optional project link
2. Lifecycle: draft → sent → accepted | rejected; no hard deletes
3. RBAC: extend permissions for financial data; enforce account boundaries on every route
4. API: server-side list/filter, create with `Idempotency-Key`, get by id
5. UI under account context: list, create draft, line-item editor

## Evaluation     

Schema & tenancy · Money-touching API correctness · RBAC · Code judgment · Fork README
    
## Submission

Share your fork URL (no PRs). Fork README must cover architecture decisions, security/tenancy review, how to run tests, and what you'd ship next (e.g. Stripe, reconciliation).
          