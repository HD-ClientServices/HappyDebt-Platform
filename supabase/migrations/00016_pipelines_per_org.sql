-- Move GHL pipeline IDs from the singleton back to per-org columns.
--
-- Background
-- ----------
-- Migration 00015 unified the entire GHL config into the singleton
-- `ghl_integration` table. That was the right call for **credentials**
-- (api_token, location_id, reconnect_webhook_url) — there is one GHL
-- account for the whole platform — but it was WRONG for pipeline IDs.
--
-- Each client org lives inside the same GHL account but has its OWN
-- opening and closing pipelines. Rise has `85kFh5EWKPg7qg9FDJfg` as
-- its opening pipeline today; a future second client will have a
-- different pipeline ID. Routing live transfers by pipeline ID is the
-- correct way to distinguish "which org owns this lead".
--
-- What 00015 got wrong caused a concrete bug:
--   - The sync route used `effectiveOrgId` from the impersonation
--     header to decide ownership.
--   - When the admin Sync Calls button in GHLIntegrationPanel.tsx
--     fired without an impersonation header, effectiveOrgId fell
--     back to the caller's home org (Intro).
--   - The UPSERT on `ghl_opportunity_id` (UNIQUE global) silently
--     rewrote `org_id` for existing rows — all 207 live_transfers
--     that belonged to Rise ended up in Intro.
--
-- This migration:
--   1. Re-adds `ghl_opening_pipeline_id` and `ghl_closing_pipeline_id`
--      to `organizations` (they were dropped by 00015).
--   2. Backfills Rise with the values currently stored in the singleton.
--   3. Moves the 207 orphaned live_transfers from Intro back to Rise.
--   4. Adds an index on `ghl_opening_pipeline_id` so the webhook
--      handler can look up "which org owns this pipeline" quickly.
--
-- We deliberately KEEP the `opening_pipeline_id` / `closing_pipeline_id`
-- columns on `ghl_integration` as legacy — the new code path will not
-- read them, but dropping them would require more churn and the
-- backfill already extracted what we needed. A future migration 00017
-- can drop them once we're sure nothing regressed.

BEGIN;

-- ── 1. Re-add the per-org pipeline columns ────────────────────────
--
-- IF NOT EXISTS makes this idempotent if an operator accidentally
-- re-runs the migration after applying it once.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_opening_pipeline_id text,
  ADD COLUMN IF NOT EXISTS ghl_closing_pipeline_id text;

-- ── 2. Backfill Rise from the singleton ───────────────────────────
--
-- The singleton has the two pipeline IDs in our dev DB (populated by
-- the original 00013 UPDATE before 00015 moved them). Copy them to
-- the Rise row so the new per-org read path works immediately.
--
-- Wrapped in DO $$ ... END $$ with an existence check so this is a
-- no-op on a fresh install where the singleton row hasn't been
-- populated yet — in that case an admin will set the values via the
-- new Admin → Organizations → Configure Pipelines dialog.

DO $$
DECLARE
  v_opening text;
  v_closing text;
BEGIN
  SELECT opening_pipeline_id, closing_pipeline_id
    INTO v_opening, v_closing
  FROM public.ghl_integration
  WHERE id = true;

  IF v_opening IS NOT NULL OR v_closing IS NOT NULL THEN
    UPDATE public.organizations
    SET
      ghl_opening_pipeline_id = v_opening,
      ghl_closing_pipeline_id = v_closing
    WHERE slug = 'rise';
  END IF;
END $$;

-- ── 3. Cleanup: move live_transfers from Intro to Rise ────────────
--
-- In the buggy state, every live_transfer row ended up with
-- `org_id = <Intro id>`. Move them to Rise in one shot. This UPDATE
-- is safe to run multiple times — if some rows are already on Rise
-- the NOT IN filter simply skips them.
--
-- Intro is the platform superadmin org; it should NEVER have
-- live_transfers. If this migration finds rows there, move them to
-- Rise (the only real client today).

UPDATE public.live_transfers
SET org_id = (SELECT id FROM public.organizations WHERE slug = 'rise')
WHERE org_id = (SELECT id FROM public.organizations WHERE slug = 'intro')
  AND EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'rise');

-- ── 4. Index for the webhook handler lookup ───────────────────────
--
-- The new webhook handler does:
--   SELECT id FROM organizations
--   WHERE ghl_opening_pipeline_id = $1 OR ghl_closing_pipeline_id = $1
--
-- A partial index on each column keeps the "configured orgs" lookup
-- fast regardless of how many rows we add to the table.

CREATE INDEX IF NOT EXISTS idx_organizations_ghl_opening_pipeline_id
  ON public.organizations(ghl_opening_pipeline_id)
  WHERE ghl_opening_pipeline_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_ghl_closing_pipeline_id
  ON public.organizations(ghl_closing_pipeline_id)
  WHERE ghl_closing_pipeline_id IS NOT NULL;

-- ── 5. Note on legacy singleton columns ───────────────────────────
--
-- `public.ghl_integration.opening_pipeline_id` and
-- `public.ghl_integration.closing_pipeline_id` are intentionally NOT
-- dropped by this migration. They stay as the authoritative source
-- until every code path has been updated to read from the per-org
-- columns. A follow-up migration (00017) will drop them once we're
-- confident there are no stragglers.
--
-- If you see a TypeScript reference to `GHLIntegrationConfig` still
-- exposing those fields, remove it — the DB will still accept the
-- legacy columns but the app must not rely on them.

COMMIT;
