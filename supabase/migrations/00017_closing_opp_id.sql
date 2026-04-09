-- Track the GHL closing-pipeline opportunity id alongside each live transfer.
--
-- Background
-- ----------
-- Each live_transfer row today stores `ghl_opportunity_id`, which is the
-- opening pipeline opp id — the one our sync primarily iterates. The
-- closing pipeline opp (where closers actually work the deal and change
-- status to won/lost) is matched on the fly by contact_id during sync
-- and never persisted. That's fine for the sync loop but painful for
-- the new "edit closing_status from the UI" flow: every edit would
-- otherwise have to re-fetch the closing pipeline, scan it for the
-- right contact, and extract the opp id before it could call GHL to
-- change the status.
--
-- This migration adds `ghl_closing_opportunity_id` so the sync can
-- capture the closing opp id at cross-match time and the edit endpoint
-- can read it directly. Backfill happens automatically on the next
-- sync run — no manual step required.

BEGIN;

ALTER TABLE public.live_transfers
  ADD COLUMN IF NOT EXISTS ghl_closing_opportunity_id text;

-- Partial index so the per-row lookup in the edit endpoint is cheap.
-- Most rows will have this set after the first sync run; partial
-- index keeps NULL rows from bloating it.
CREATE INDEX IF NOT EXISTS idx_live_transfers_ghl_closing_opp
  ON public.live_transfers(ghl_closing_opportunity_id)
  WHERE ghl_closing_opportunity_id IS NOT NULL;

COMMIT;
