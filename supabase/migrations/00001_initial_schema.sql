-- Intro Client Portal — Initial schema + RLS
-- Run with: supabase db push (or via Dashboard SQL)

-- Organizations (MCA companies / clients of Intro)
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'growth', 'enterprise')),
  trial_ends_at timestamptz,
  stripe_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Users with role-based access (id = auth.users.id)
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) NOT NULL,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role text DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer', 'intro_admin')),
  last_active_at timestamptz,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Closers (sales reps tracked per org)
CREATE TABLE closers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  avatar_url text,
  active boolean DEFAULT true,
  ghl_user_id text,
  created_at timestamptz DEFAULT now()
);

-- Live Transfers (won leads)
CREATE TABLE live_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  closer_id uuid REFERENCES closers(id) ON DELETE SET NULL,
  lead_name text NOT NULL,
  lead_phone text,
  lead_email text,
  business_name text,
  transfer_date timestamptz NOT NULL,
  status text DEFAULT 'transferred' CHECK (status IN ('transferred', 'connected', 'funded', 'declined', 'no_answer')),
  amount decimal,
  notes text,
  ghl_opportunity_id text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Call Recordings with AI analysis
CREATE TABLE call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  closer_id uuid REFERENCES closers(id) ON DELETE CASCADE NOT NULL,
  live_transfer_id uuid REFERENCES live_transfers(id) ON DELETE SET NULL,
  recording_url text NOT NULL,
  duration_seconds integer,
  call_date timestamptz NOT NULL,
  transcript text,
  ai_analysis jsonb,
  sentiment_score decimal CHECK (sentiment_score IS NULL OR (sentiment_score >= -1 AND sentiment_score <= 1)),
  evaluation_score decimal CHECK (evaluation_score IS NULL OR (evaluation_score >= 0 AND evaluation_score <= 100)),
  strengths text[],
  improvement_areas text[],
  is_critical boolean DEFAULT false,
  critical_action_plan text,
  ghl_conversation_id text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Evaluation Templates
CREATE TABLE evaluation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  criteria jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Actionables
CREATE TABLE actionables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  source_type text CHECK (source_type IN ('call_review', 'closer_profile', 'overview', 'suggestion', 'manual')),
  source_id uuid,
  priority text DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'dismissed')),
  due_date timestamptz,
  assigned_to uuid REFERENCES closers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- PLG Analytics Events
CREATE TABLE plg_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  event_properties jsonb,
  session_id text,
  created_at timestamptz DEFAULT now()
);

-- Feature usage (activation/retention)
CREATE TABLE feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  feature_key text NOT NULL,
  usage_count integer DEFAULT 1,
  first_used_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  UNIQUE (org_id, user_id, feature_key)
);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER evaluation_templates_updated_at
  BEFORE UPDATE ON evaluation_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: enable on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE closers ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE actionables ENABLE ROW LEVEL SECURITY;
ALTER TABLE plg_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper functions: placed in public schema (NOT auth) per Supabase best practice.
-- All three are SECURITY DEFINER so they run with the owner's privileges and
-- can safely query public.users from within RLS policies.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_org_id()
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT org_id FROM public.users WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.user_role()
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT role FROM public.users WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_intro_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'intro_admin';
$$;

-- Restrict execution: revoke from anon, then grant back only to authenticated
REVOKE EXECUTE ON FUNCTION public.user_org_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_intro_admin() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_intro_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS Policies (all references updated to public.* functions)
-- ---------------------------------------------------------------------------

-- Organizations: users see own org; admin sees all
CREATE POLICY "Users read own org" ON organizations
  FOR SELECT USING (
    public.is_intro_admin() OR id = public.user_org_id()
  );
CREATE POLICY "Admin/manager update own org" ON organizations
  FOR ALL USING (
    (public.user_role() IN ('admin', 'manager') AND id = public.user_org_id())
    OR public.is_intro_admin()
  );

-- Users: users see same-org users; admin manages same-org
CREATE POLICY "Users read org members" ON users
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Admin insert/update/delete org users" ON users
  FOR ALL USING (
    public.is_intro_admin() OR (public.user_role() = 'admin' AND org_id = public.user_org_id())
  );

-- Closers: org-scoped
CREATE POLICY "Org members read closers" ON closers
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Manager+ write closers" ON closers
  FOR ALL USING (
    public.is_intro_admin() OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
  );

-- Live transfers: org-scoped
CREATE POLICY "Org members read live_transfers" ON live_transfers
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Manager+ write live_transfers" ON live_transfers
  FOR ALL USING (
    public.is_intro_admin() OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
  );

-- Call recordings: org-scoped
CREATE POLICY "Org members read call_recordings" ON call_recordings
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Manager+ write call_recordings" ON call_recordings
  FOR ALL USING (
    public.is_intro_admin() OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
  );

-- Evaluation templates: org-scoped
CREATE POLICY "Org members read evaluation_templates" ON evaluation_templates
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Manager+ write evaluation_templates" ON evaluation_templates
  FOR ALL USING (
    public.is_intro_admin() OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
  );

-- Actionables: viewers can CRUD own; manager+ all org
CREATE POLICY "Org members read actionables" ON actionables
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Viewer insert own actionables" ON actionables
  FOR INSERT WITH CHECK (
    public.is_intro_admin() OR (org_id = public.user_org_id() AND user_id = (SELECT auth.uid()))
  );
CREATE POLICY "Viewer or manager+ update actionables" ON actionables
  FOR UPDATE USING (
    public.is_intro_admin()
    OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
    OR (user_id = (SELECT auth.uid()) AND org_id = public.user_org_id())
  );
CREATE POLICY "Viewer or manager+ delete actionables" ON actionables
  FOR DELETE USING (
    public.is_intro_admin()
    OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
    OR (user_id = (SELECT auth.uid()) AND org_id = public.user_org_id())
  );
CREATE POLICY "Manager+ insert any actionable" ON actionables
  FOR INSERT WITH CHECK (
    public.is_intro_admin() OR (public.user_role() IN ('admin', 'manager') AND org_id = public.user_org_id())
  );

-- plg_events: org members insert; admin read all
CREATE POLICY "Org members insert plg_events" ON plg_events
  FOR INSERT WITH CHECK (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Admin read all plg_events" ON plg_events
  FOR SELECT USING (public.is_intro_admin());
CREATE POLICY "Org read own plg_events" ON plg_events
  FOR SELECT USING (org_id = public.user_org_id());

-- feature_usage: org members upsert own; admin read all
CREATE POLICY "Org members read feature_usage" ON feature_usage
  FOR SELECT USING (
    public.is_intro_admin() OR org_id = public.user_org_id()
  );
CREATE POLICY "Org members insert feature_usage" ON feature_usage
  FOR INSERT WITH CHECK (org_id = public.user_org_id());
CREATE POLICY "Org members update feature_usage" ON feature_usage
  FOR UPDATE USING (org_id = public.user_org_id());
