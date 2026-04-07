-- Make closer_id nullable on call_recordings.
-- Not every GHL call has a {{contact.closer}} value set.
ALTER TABLE call_recordings ALTER COLUMN closer_id DROP NOT NULL;
