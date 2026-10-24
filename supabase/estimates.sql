-- =============================================================
-- ESTIMATES & ESTIMATE LINE ITEMS (Revenue & Billing Module)
-- Additive migration for existing Kontrora databases
-- =============================================================

CREATE TABLE IF NOT EXISTS estimates (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                 UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id                 UUID REFERENCES projects(id) ON DELETE SET NULL,
  estimate_number            TEXT NOT NULL,
  title                      TEXT NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  currency                   TEXT NOT NULL DEFAULT 'USD',
  subtotal_minor             BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (discount_rate_basis_points >= 0 AND discount_rate_basis_points <= 10000),
  discount_minor             BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_rate_basis_points      INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points >= 0 AND tax_rate_basis_points <= 10000),
  tax_minor                  BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor                BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  notes                      TEXT,
  terms                      TEXT,
  valid_until                DATE,
  sent_at                    TIMESTAMPTZ,
  accepted_at                TIMESTAMPTZ,
  rejected_at                TIMESTAMPTZ,
  rejection_reason           TEXT,
  created_by                 UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  idempotency_key            TEXT UNIQUE,
  deleted_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_estimates_account_number UNIQUE (account_id, estimate_number)
);

CREATE TRIGGER trg_estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_estimates_account_id ON estimates(account_id);
CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_created_by ON estimates(created_by);
CREATE INDEX IF NOT EXISTS idx_estimates_idempotency ON estimates(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_deleted_at ON estimates(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS estimate_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id       UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  description       TEXT NOT NULL,
  quantity          NUMERIC(12, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_minor  BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  amount_minor      BIGINT NOT NULL CHECK (amount_minor >= 0),
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_estimate_line_items_updated_at
  BEFORE UPDATE ON estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate_id ON estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_account_id ON estimate_line_items(account_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_position ON estimate_line_items(estimate_id, position);

CREATE OR REPLACE FUNCTION prevent_hard_delete_estimates()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion of estimates is not allowed. Use soft-delete (deleted_at) or status transitions.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_estimates ON estimates;
CREATE TRIGGER trg_prevent_hard_delete_estimates
  BEFORE DELETE ON estimates
  FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_estimates();

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_service_role_all" ON estimates
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "estimate_line_items_service_role_all" ON estimate_line_items
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "estimates_tenant_select" ON estimates
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND (user_profiles.is_superadmin = TRUE OR user_profiles.client_account_id = estimates.account_id)
      )
      OR
      EXISTS (
        SELECT 1 FROM accounts
        WHERE accounts.id = estimates.account_id
          AND accounts.account_manager_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM account_members
        WHERE account_members.account_id = estimates.account_id
          AND account_members.user_id = auth.uid()
          AND account_members.removed_at IS NULL
      )
    )
  );

CREATE POLICY "estimates_tenant_insert" ON estimates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimates.account_id
        AND accounts.account_manager_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimates.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
  );

CREATE POLICY "estimates_tenant_update" ON estimates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimates.account_id
        AND accounts.account_manager_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimates.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
  );

CREATE POLICY "estimate_line_items_tenant_select" ON estimate_line_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND (user_profiles.is_superadmin = TRUE OR user_profiles.client_account_id = estimate_line_items.account_id)
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimate_line_items.account_id
        AND accounts.account_manager_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimate_line_items.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
  );

CREATE POLICY "estimate_line_items_tenant_insert" ON estimate_line_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimate_line_items.account_id
        AND accounts.account_manager_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimate_line_items.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
  );

CREATE POLICY "estimate_line_items_tenant_update" ON estimate_line_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimate_line_items.account_id
        AND accounts.account_manager_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimate_line_items.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
  );

CREATE POLICY "estimate_line_items_tenant_delete" ON estimate_line_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimate_line_items.account_id
        AND accounts.account_manager_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimate_line_items.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
  );
