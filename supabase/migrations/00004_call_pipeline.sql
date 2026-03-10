-- Call Processing Pipeline — Job queue + schema extensions

-- Processing job queue for async call analysis
CREATE TABLE processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  job_type text NOT NULL CHECK (job_type IN ('call_analysis', 'manual_sync')),
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

CREATE INDEX idx_processing_jobs_status ON processing_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_processing_jobs_org ON processing_jobs(org_id, created_at DESC);

ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (API routes use service role key)
CREATE POLICY "Service role full access" ON processing_jobs FOR ALL USING (true);

-- Add processing_status to call_recordings for UI feedback
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'completed'
  CHECK (processing_status IN ('pending', 'transcribing', 'analyzing', 'completed', 'failed'));

-- Add ghl_message_id to call_recordings for deduplication
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS ghl_message_id text;

-- Add contact info to call_recordings for display
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS business_name text;

-- Add GHL settings to organizations for per-org config
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ghl_api_token text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ghl_location_id text;
