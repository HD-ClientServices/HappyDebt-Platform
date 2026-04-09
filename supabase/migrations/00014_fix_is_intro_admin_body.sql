-- Fix `is_intro_admin()` function body.
--
-- The rebrand migration (00009) correctly renamed the function from
-- `is_happydebt_admin()` to `is_intro_admin()` and migrated every
-- `users.role = 'happydebt_admin'` row to `'intro_admin'`. But it
-- never updated the SQL body of the function itself, which still
-- compares against the legacy string literal:
--
--   SELECT (SELECT role FROM users WHERE id = auth.uid())
--          = 'happydebt_admin';
--
-- Since no user row has that role any more, the function always
-- returns FALSE. As a result every RLS policy that uses it as the
-- admin bypass (live_transfers, call_recordings, leads, etc.) silently
-- blocks intro_admin users from reading data outside their own org —
-- which breaks the entire client-side "View as org X" impersonation
-- feature. Admins see their own Intro data only, and queries against
-- impersonated orgs come back empty.
--
-- This migration:
--   1. Rewrites the function body to compare against the current
--      `'intro_admin'` role value.
--   2. Also covers the staff-email fallback from the design_tokens
--      policy (00006) so that even a user who hasn't been auto-promoted
--      yet still works while the 00010 trigger catches up.
--   3. Fixes the `design_tokens` write policy to use the same function,
--      removing the hardcoded `'happydebt_admin'` string that has the
--      same stale-literal problem.

BEGIN;

-- ── 1. Rewrite is_intro_admin() body ───────────────────────────────────
--
-- Accept either:
--   (a) explicit users.role = 'intro_admin', or
--   (b) staff email on @happydebt.com / @tryintro.com as a safety net
--       for any user whose role hasn't been promoted yet (e.g. a brand-
--       new staff signup before the 00010 trigger writes the role).
--
-- Keeping SECURITY DEFINER + STABLE matches the original so RLS
-- performance characteristics are unchanged. Returns false (not null)
-- when auth.uid() is absent (anon context) — RLS treats null as fail.
CREATE OR REPLACE FUNCTION public.is_intro_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = (SELECT auth.uid())
      AND (
        role = 'intro_admin'
        OR email ILIKE '%@happydebt.com'
        OR email ILIKE '%@tryintro.com'
      )
  );
$$;

-- Re-grant in case the rename left the permissions in an odd state.
-- (The rename in 00009 preserved them, but this is cheap insurance.)
REVOKE EXECUTE ON FUNCTION public.is_intro_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_intro_admin() TO authenticated;

-- ── 2. Fix design_tokens write policy ──────────────────────────────────
--
-- 00006 inlined the staff check instead of calling is_happydebt_admin().
-- That inline expression still references 'happydebt_admin' as a literal
-- role, which is equally stale after the rebrand. Replace it with a
-- call to the (now-correct) is_intro_admin() function.
DROP POLICY IF EXISTS "HappyDebt staff write design tokens" ON public.design_tokens;

CREATE POLICY "Intro staff write design tokens" ON public.design_tokens
  FOR ALL USING (public.is_intro_admin())
  WITH CHECK (public.is_intro_admin());

COMMIT;
