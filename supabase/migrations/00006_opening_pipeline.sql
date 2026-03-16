-- Add opening pipeline ID to organizations for opportunity sync
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS ghl_opening_pipeline_id text;
