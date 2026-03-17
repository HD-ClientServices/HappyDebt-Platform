-- ============================================================
-- Design Token Overrides
-- Stores custom CSS variable overrides that admins can edit
-- via the admin design system editor. These override the
-- defaults in design-system/tokens.css at runtime.
-- ============================================================

CREATE TABLE IF NOT EXISTS design_token_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  token_key text NOT NULL,
  token_value text NOT NULL,
  token_category text DEFAULT 'color' CHECK (token_category IN ('color', 'spacing', 'radius', 'shadow', 'typography', 'transition')),
  theme text DEFAULT 'all' CHECK (theme IN ('dark', 'light', 'all')),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, token_key, theme)
);

-- Global overrides (org_id IS NULL) also need uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS design_token_overrides_global_unique
  ON design_token_overrides (token_key, theme)
  WHERE org_id IS NULL;

ALTER TABLE design_token_overrides ENABLE ROW LEVEL SECURITY;

-- Only happydebt_admin can read/write design tokens
CREATE POLICY "Admin read design tokens" ON design_token_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'happydebt_admin'
    )
  );

CREATE POLICY "Admin write design tokens" ON design_token_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'happydebt_admin'
    )
  );
