-- Unify GHL integration into a single global config row.
--
-- Background
-- ----------
-- Earlier migrations (00004, 00008, 00013) modeled GHL credentials and
-- pipeline IDs as PER-ORG columns on `organizations`. That was wrong:
-- there is only one Go High Level account in this product, owned by
-- Intro/Rise Alliance, and all client orgs share it. The per-org columns
-- forced the admin UI to ask "which org" before letting them edit the
-- token, and surfaced a misleading "Configure GHL" button on every
-- organization card.
--
-- This migration:
--   1. Creates a singleton `public.ghl_integration` table (one row,
--      enforced by a CHECK constraint on a boolean PK).
--   2. Backfills it from whichever org row currently has the most
--      complete GHL config (in practice that's Rise).
--   3. Drops the now-orphaned columns from `organizations`.
--   4. Locks the table down with RLS so only intro_admin can read or
--      write the credentials.
--
-- After this lands:
--   - All API routes read GHL credentials from `ghl_integration` via
--     `lib/ghl/getGlobalConfig.ts`.
--   - The Admin → GHL Integration tab edits the singleton.
--   - The per-org `OrgConfigDialog` is gone, along with the
--     `/api/admin/orgs/[orgId]/config` endpoint.

BEGIN;

-- ── 1. Singleton ghl_integration table ────────────────────────────
--
-- The classic "singleton" trick: a boolean PK with a CHECK that pins
-- it to TRUE means at most one row can exist. INSERT a second row →
-- unique-key violation. We pair it with a CREATE OR REPLACE trigger
-- below that timestamps updates.

CREATE TABLE IF NOT EXISTS public.ghl_integration (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  api_token text,
  location_id text,
  opening_pipeline_id text,
  closing_pipeline_id text,
  reconnect_webhook_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.ghl_integration IS
  'Single global GHL configuration row. There is only one GHL account
   for the entire platform. Edit via the Admin → GHL Integration tab.';

-- Auto-bump updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.touch_ghl_integration_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ghl_integration_set_updated_at ON public.ghl_integration;
CREATE TRIGGER ghl_integration_set_updated_at
  BEFORE UPDATE ON public.ghl_integration
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ghl_integration_updated_at();

-- ── 2. Backfill from the most-configured org ──────────────────────
--
-- Choose the org row with the longest non-null api_token (Rise should
-- win in production; if more than one is configured we just pick the
-- most recently updated). If no org has credentials, we still INSERT
-- an empty row so the singleton always exists and admins can fill it
-- in via the UI.

INSERT INTO public.ghl_integration (
  id,
  api_token,
  location_id,
  opening_pipeline_id,
  closing_pipeline_id,
  reconnect_webhook_url
)
SELECT
  true,
  o.ghl_api_token,
  o.ghl_location_id,
  o.ghl_opening_pipeline_id,
  o.ghl_closing_pipeline_id,
  o.ghl_reconnect_webhook_url
FROM public.organizations o
WHERE o.ghl_api_token IS NOT NULL
ORDER BY length(coalesce(o.ghl_api_token, '')) DESC, o.created_at DESC
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- Ensure the singleton row always exists, even if no org had any
-- credentials (e.g. fresh install).
INSERT INTO public.ghl_integration (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Drop the now-orphaned columns from organizations ───────────
--
-- These were never the right place to store credentials. Keeping them
-- around would lead to silent drift between the singleton and the per-
-- org rows.

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS ghl_api_token,
  DROP COLUMN IF EXISTS ghl_location_id,
  DROP COLUMN IF EXISTS ghl_opening_pipeline_id,
  DROP COLUMN IF EXISTS ghl_closing_pipeline_id,
  DROP COLUMN IF EXISTS ghl_reconnect_webhook_url;

-- ── 4. Lock the table down with RLS ───────────────────────────────
--
-- intro_admin only — both reads and writes. The credentials are
-- sensitive (they grant full access to the GHL account) and should
-- never leak to a client-side query from a non-staff user.

ALTER TABLE public.ghl_integration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Intro admin reads ghl_integration"
  ON public.ghl_integration;
CREATE POLICY "Intro admin reads ghl_integration"
  ON public.ghl_integration
  FOR SELECT
  USING (public.is_intro_admin());

DROP POLICY IF EXISTS "Intro admin writes ghl_integration"
  ON public.ghl_integration;
CREATE POLICY "Intro admin writes ghl_integration"
  ON public.ghl_integration
  FOR ALL
  USING (public.is_intro_admin())
  WITH CHECK (public.is_intro_admin());

-- The service role bypasses RLS automatically, so server-side
-- API routes (using createAdminClient) can read regardless of policy.

COMMIT;
