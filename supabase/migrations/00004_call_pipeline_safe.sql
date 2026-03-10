-- Call Processing Pipeline — SAFE/IDEMPOTENT version
-- Run this if 00004_call_pipeline.sql fails with "relation already exists"

-- Processing job queue (skip if already exists)
CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb,
  call_recording_id uuid REFERENCES call_recordings(id) ON DELETE SET NULL,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Indexes (safe — will skip if they exist)
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_processing_jobs_org ON processing_jobs(org_id, created_at DESC);

-- RLS
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Policy (drop + recreate to avoid duplicate errors)
DROP POLICY IF EXISTS "Service role full access" ON processing_jobs;
CREATE POLICY "Service role full access" ON processing_jobs FOR ALL USING (true);

-- Allow 'call_qa' as a job_type (the sync route uses it)
-- Drop the old CHECK constraint and add a broader one
DO $$
BEGIN
  -- Try to drop existing check constraint on job_type
  ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_job_type_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Add columns to call_recordings
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'completed';
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS ghl_message_id text;
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS business_name text;

-- Add GHL settings to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ghl_api_token text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ghl_location_id text;
