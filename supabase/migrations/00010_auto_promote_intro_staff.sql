-- Auto-promote users with @happydebt.com or @tryintro.com email to intro_admin role.
-- Bridges the gap between frontend email check (sidebar, admin page) and the
-- SQL is_intro_admin() function which reads users.role. Without this migration,
-- new staff users see the Admin UI but RLS denies cross-org access.

CREATE OR REPLACE FUNCTION public.auto_promote_intro_staff()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email LIKE '%@happydebt.com' OR NEW.email LIKE '%@tryintro.com' THEN
    NEW.role := 'intro_admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_intro_staff ON public.users;
CREATE TRIGGER trg_auto_promote_intro_staff
  BEFORE INSERT OR UPDATE OF email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_promote_intro_staff();

-- Backfill existing rows
UPDATE public.users
SET role = 'intro_admin'
WHERE (email LIKE '%@happydebt.com' OR email LIKE '%@tryintro.com')
  AND role <> 'intro_admin';
