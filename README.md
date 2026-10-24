# Kontrora — Staff Engineer Assignment (Revenue & Billing: Estimates)

A production-grade, account-scoped **Estimates & Line-Items Engine** implemented end-to-end for the Kontrora Professional Services Automation (PSA) platform.

---

## 🚀 Quick Setup & Migration

### 1. Requirements
- Node.js **20.9+**
- PostgreSQL / Supabase project

### 2. Environment Configuration
```bash
npm install
cp .env.local.template .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and service keys
```

### 3. Database Migration
You have two safe options depending on whether you have an existing database:

* **For existing databases (Zero Downtime, Additive Migration):**
  Run [`supabase/estimates.sql`](supabase/estimates.sql) in the Supabase SQL Editor, followed by [`supabase/seed-roles.sql`](supabase/seed-roles.sql).
* **For brand new databases:**
  Run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/seed-roles.sql`](supabase/seed-roles.sql), then `npm run seed:users`.

### 4. Running the App & Tests
```bash
# Run unit test suite (financial calculation, state machine, formatters)
npm test

# Run local development server
npm run dev
# Open http://localhost:3000
```

---

## 🏛️ Architecture & Engineering Decisions

### 1. Money Handling & Financial Precision
* **Zero Floating-Point Representation:** All monetary values are strictly stored as `BIGINT` in minor units (e.g., cents, paisa). $1,500.00 is stored as `150000`.
* **Basis Points for Percentage Rates:** Tax and discount percentages are stored as integer basis points (`1% = 100 bps`, `8.25% = 825 bps`). This eliminates IEEE 754 float drift in tax calculations.
* **Authoritative Server-Side Calculation Engine:** Client calculations are solely for UI preview. The server recalculates and validates all line items, subtotal, discount, and tax:
  $$\text{Item Amount} = \text{round}(\text{quantity} \times \text{unit\_price\_minor})$$
  $$\text{Subtotal} = \sum \text{Item Amount}$$
  $$\text{Discount} = \text{round}\left(\frac{\text{Subtotal} \times \text{discount\_rate\_basis\_points}}{10000}\right)$$
  $$\text{Taxable} = \max(0, \text{Subtotal} - \text{Discount})$$
  $$\text{Tax} = \text{round}\left(\frac{\text{Taxable} \times \text{tax\_rate\_basis\_points}}{10000}\right)$$
  $$\text{Total} = \text{Taxable} + \text{Tax}$$

### 2. Idempotency & Safe Retries
* API route `POST /api/accounts/[accountId]/estimates` inspects the standard HTTP header `Idempotency-Key` (or JSON body `idempotency_key`).
* If a request is received with an existing idempotency key for that account, the server returns the existing estimate with HTTP status `200` and header `Idempotent-Replayed: true`, preventing accidental duplicate billing creation under network retries.

### 3. Audit Integrity & Hard-Delete Prevention
* **Financial Compliance:** In accordance with financial audit requirements, estimates cannot be hard-deleted once created.
* Enforced at the database level via PostgreSQL trigger `trg_prevent_hard_delete_estimates` which raises an exception on `DELETE`.
* Soft-delete support is provided via the `deleted_at` column, and API `DELETE` endpoints return `405 Method Not Allowed`.

### 4. Lifecycle State Machine
Estimates follow a strict, validated lifecycle:
$$\text{Draft} \longrightarrow \text{Sent} \longrightarrow \text{Accepted} \mid \text{Rejected}$$
* **Draft:** Editable line items and terms.
* **Sent:** Dispatched to client; financials locked.
* **Accepted / Rejected:** Terminal status.

---

## 🔐 Security, RBAC & Multi-Tenant Isolation

### 1. Three-Tier Isolation Model
Every interaction is guarded at three distinct layers:
1. **Route Level Guards (`requirePermission`):** Validates authentication session and user permissions before touching business logic.
2. **Service Layer Boundary Checks:** All queries in `EstimatesService` mandate `accountId` in WHERE clauses, guaranteeing queries never bleed across account boundaries.
3. **Database Row Level Security (RLS):** Policies on `estimates` and `estimate_line_items` ensure that authenticated users can only access records where they belong to the account (via `account_members`, `account_manager_id`, `client_account_id`, or `is_superadmin`).

### 2. Extended RBAC Permissions
The following granular permissions were added to `lib/permissions.ts` and configured in `supabase/seed-roles.sql`:
* `estimates.read`: View account estimates and line items. (Granted to: Client, Project Manager, Account Manager, Executive Director, Superadmin).
* `estimates.create`: Create new draft estimates. (Granted to: Project Manager, Account Manager, Superadmin).
* `estimates.update`: Modify existing draft estimates. (Granted to: Project Manager, Account Manager, Superadmin).
* `estimates.send`: Dispatch estimates to clients and transition acceptance status. (Granted to: Account Manager, Superadmin).

---

## 🧪 Testing Suite

Unit test coverage is located in [`__tests__/estimates.test.ts`](__tests__/estimates.test.ts):
* Deterministic integer calculations for subtotal, discount, tax, and total.
* Fractional quantity handling (e.g., 2.5 hours @ $200.00/hr = $500.00).
* Basis point clamping and edge-case validation.
* Zero-quantity and negative-price input rejection.
* Currency formatting for minor units.
* Lifecycle state transition matrix validation.

Run tests:
```bash
npm test
```

---

## 🔮 What We'd Ship Next (Roadmap)

1. **One-Click Estimate to Invoice Conversion:**
   Allow an accepted estimate to automatically generate a draft invoice or escrow milestone with mirrored line items.
2. **Stripe Billing & Hosted Payment Links:**
   Generate Stripe checkout sessions directly from sent estimates upon acceptance.
3. **PDF Generation & Client E-Sign:**
   Server-side PDF rendering using `@react-pdf/renderer` with legal disclaimers and client digital signature capture.
4. **Email Dispatch & Delivery Webhooks:**
   Integrate Nodemailer/Resend to email estimate PDFs with tracked open and acceptance events.