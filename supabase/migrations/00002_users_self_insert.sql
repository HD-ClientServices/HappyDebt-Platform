-- Allow new users to insert their own row (onboarding flow)
-- Note: references public.users explicitly; uses (select auth.uid()) for planner optimisation.
CREATE POLICY "Users insert own row" ON public.users
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

-- Allow users to update their own row (e.g. onboarding_completed)
CREATE POLICY "Users update own row" ON public.users
  FOR UPDATE USING ((SELECT auth.uid()) = id);
