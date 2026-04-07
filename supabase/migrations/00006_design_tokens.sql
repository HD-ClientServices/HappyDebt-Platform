-- Design Tokens — global theme configuration editable from /admin/design-system
-- Single source of truth for colors, typography, radius across the platform

CREATE TABLE design_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  tokens jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (scope)
);

-- Seed initial global tokens with green primary color
INSERT INTO design_tokens (scope, tokens) VALUES ('global', '{
  "colors": {
    "background": "#0a0a0a",
    "foreground": "#fafafa",
    "card": "#121212",
    "border": "#27272a",
    "muted": "#27272a",
    "muted-foreground": "#a1a1aa",
    "primary": "#10b981",
    "primary-hover": "#059669",
    "primary-foreground": "#ffffff"
  },
  "typography": {
    "font-heading": "Space Grotesk",
    "font-sans": "Inter"
  },
  "radius": {
    "sm": "6px",
    "md": "8px",
    "lg": "12px"
  }
}'::jsonb);

-- updated_at trigger
CREATE TRIGGER design_tokens_updated_at
  BEFORE UPDATE ON design_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE design_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (needed to apply tokens at runtime)
CREATE POLICY "Authenticated read design tokens" ON design_tokens
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only happydebt staff can modify (write policy enforced via API too)
CREATE POLICY "HappyDebt staff write design tokens" ON design_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'happydebt_admin'
          OR users.email LIKE '%@happydebt.com'
          OR users.email LIKE '%@tryintro.com'
        )
    )
  );
