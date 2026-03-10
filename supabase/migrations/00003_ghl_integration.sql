-- Add Go High Level Integration Fields to existing tables

ALTER TABLE public.closers 
ADD COLUMN IF NOT EXISTS ghl_user_id text;

ALTER TABLE public.live_transfers 
ADD COLUMN IF NOT EXISTS ghl_opportunity_id text UNIQUE;

ALTER TABLE public.call_recordings 
ADD COLUMN IF NOT EXISTS ghl_conversation_id text UNIQUE;
