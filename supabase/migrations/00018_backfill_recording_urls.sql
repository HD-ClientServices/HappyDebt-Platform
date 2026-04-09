-- Migration 00018: Backfill recording_url for existing call_recordings
--
-- The recording_url column was always inserted as "" (empty string) in
-- processCall. This backfill sets it to the authenticated proxy endpoint
-- `/api/recordings/{id}/audio` for every row that has a `ghl_message_id`
-- (which means the recording exists in GHL and can be fetched).
--
-- This enables the existing React-based CallAudioPlayer component
-- across the platform, which gates on `if (call.recording_url)`.
--
-- Idempotent: only updates rows where recording_url is null or empty.

UPDATE call_recordings
SET recording_url = '/api/recordings/' || id || '/audio'
WHERE ghl_message_id IS NOT NULL
  AND (recording_url IS NULL OR recording_url = '');
