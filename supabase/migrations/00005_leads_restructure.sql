-- HappyDebt — Leads restructure: central entity for lead management + closing intelligence
-- Introduces `leads` table as the parent entity for calls, recordings, QA, and scores.

-- ── 1. Create leads table ─────────────────────────────────────────────
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  closer_id uuid REFERENCES closers(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email text,
  business_name text,
  source text DEFAULT 'happydebt' CHECK (source IN ('happydebt', 'client_upload', 'ghl_sync')),
  ghl_contact_id text,
  ghl_opportunity_id text UNIQUE,
  status text DEFAULT 'in_sequence' CHECK (status IN ('in_sequence', 'transferred', 'closed_won')),
  amount decimal,
  transfer_date timestamptz,
  closed_date timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_leads_org_status ON leads(org_id, status);
CREATE INDEX idx_leads_org_closer ON leads(org_id, closer_id);
CREATE INDEX idx_leads_ghl_contact ON leads(ghl_contact_id);
CREATE INDEX idx_leads_source ON leads(org_id, source);

-- updated_at trigger
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Add lead_id + evaluation_template_id to call_recordings ────────
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS evaluation_template_id uuid REFERENCES evaluation_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_call_recordings_lead ON call_recordings(lead_id);

-- ── 3. RLS for leads ──────────────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's leads
CREATE POLICY "Org members read leads" ON leads
  FOR SELECT USING (
    public.is_happydebt_admin() OR org_id = public.user_org_id()
  );

-- Manager+ can insert/update/delete leads
CREATE POLICY "Manager+ write leads" ON leads
  FOR ALL USING (
    public.is_happydebt_admin() OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
  );

-- ── 4. Migrate existing live_transfers → leads ───────────────────────
INSERT INTO leads (org_id, closer_id, name, phone, email, business_name, ghl_opportunity_id, status, amount, transfer_date, source, created_at)
SELECT
  lt.org_id,
  lt.closer_id,
  lt.lead_name,
  lt.lead_phone,
  lt.lead_email,
  lt.business_name,
  lt.ghl_opportunity_id,
  CASE
    WHEN lt.status = 'funded' THEN 'closed_won'
    WHEN lt.status IN ('transferred', 'connected') THEN 'transferred'
    ELSE 'in_sequence'
  END,
  lt.amount,
  lt.transfer_date,
  'ghl_sync',
  lt.created_at
FROM live_transfers lt
WHERE lt.ghl_opportunity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.ghl_opportunity_id = lt.ghl_opportunity_id);

-- Backfill call_recordings.lead_id through live_transfer_id → leads
UPDATE call_recordings cr
SET lead_id = l.id
FROM live_transfers lt
JOIN leads l ON l.ghl_opportunity_id = lt.ghl_opportunity_id
WHERE cr.live_transfer_id = lt.id
  AND cr.lead_id IS NULL;
