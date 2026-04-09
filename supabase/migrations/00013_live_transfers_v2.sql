-- Live Transfers v2: connect Live Transfers section directly to GHL,
-- with closing_status derived from the closing pipeline + per-org config
-- for opening pipeline, closing pipeline, and reconnect webhook URL.

BEGIN;

-- ── 1. live_transfers schema additions ───────────────────────────────

-- status_change_date: when the opp's status changed (lastStatusChangeAt
-- from GHL). Used as the primary date for filtering/grouping in the UI.
-- closing_status: derived from the closing pipeline opp matched by contact_id.
-- ghl_contact_id: top-level contact id, used for matching opening ↔ closing.
ALTER TABLE public.live_transfers
ADD COLUMN IF NOT EXISTS status_change_date timestamptz,
ADD COLUMN IF NOT EXISTS closing_status text,
ADD COLUMN IF NOT EXISTS ghl_contact_id text;

-- Backfill status_change_date from existing transfer_date for legacy rows
UPDATE public.live_transfers
SET status_change_date = transfer_date
WHERE status_change_date IS NULL;

-- CHECK constraint for closing_status
ALTER TABLE public.live_transfers
DROP CONSTRAINT IF EXISTS live_transfers_closing_status_check;
ALTER TABLE public.live_transfers
ADD CONSTRAINT live_transfers_closing_status_check
CHECK (closing_status IS NULL OR closing_status IN
  ('pending_to_close', 'closed_won', 'closed_lost', 'disqualified'));

-- Index for fast period filtering
CREATE INDEX IF NOT EXISTS idx_live_transfers_status_change_date
ON public.live_transfers(org_id, status_change_date DESC);

CREATE INDEX IF NOT EXISTS idx_live_transfers_ghl_contact_id
ON public.live_transfers(ghl_contact_id)
WHERE ghl_contact_id IS NOT NULL;

-- ── 2. organizations: per-org GHL config (LEGACY — see 00015) ───────
--
-- Historical note: this migration originally added three per-org GHL
-- columns. A later migration (00015_unify_ghl_integration) collapsed
-- them into a singleton table and DROPped the columns from
-- `organizations`. If this file is re-run AFTER 00015 — e.g. by an
-- operator retrying the migration manually, or by an automated runner
-- replaying the full history on a snapshot restore — the UPDATE below
-- would crash on the first column reference.
--
-- The ALTER + UPDATE are now wrapped in idempotent guards:
--   - ADD COLUMN IF NOT EXISTS handles the add side.
--   - The UPDATE runs inside a DO $$ ... END $$ block that first
--     checks `information_schema.columns` to confirm the column still
--     exists in this database. If 00015 has already dropped it, the
--     block is a no-op and the rest of 00013 continues cleanly.

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS ghl_closing_pipeline_id text,
ADD COLUMN IF NOT EXISTS ghl_reconnect_webhook_url text;

-- Configure Rise with verified pipeline IDs and webhook URL — only
-- runs if the legacy per-org columns are still present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'ghl_opening_pipeline_id'
  ) THEN
    UPDATE public.organizations
    SET
      ghl_opening_pipeline_id = '85kFh5EWKPg7qg9FDJfg',
      ghl_closing_pipeline_id = 'xXSPcEgGwRNwxndym0c7',
      ghl_reconnect_webhook_url = 'https://services.leadconnectorhq.com/hooks/NXZFG9aQz6r1UXzZoedy/webhook-trigger/5d3a789a-00c6-4b7d-adf0-fdc3aa1f1126'
    WHERE slug = 'rise';
  END IF;
END $$;

-- ── 3. live_transfer_feedback table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_transfer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  live_transfer_id uuid REFERENCES live_transfers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.live_transfer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read feedback" ON public.live_transfer_feedback
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );

CREATE POLICY "Org members insert feedback" ON public.live_transfer_feedback
  FOR INSERT WITH CHECK (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );

CREATE INDEX IF NOT EXISTS idx_lt_feedback_live_transfer
ON public.live_transfer_feedback(live_transfer_id);

CREATE INDEX IF NOT EXISTS idx_lt_feedback_org
ON public.live_transfer_feedback(org_id);

COMMIT;
