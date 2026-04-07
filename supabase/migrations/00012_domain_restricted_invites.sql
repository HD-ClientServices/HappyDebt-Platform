-- Domain-restricted invites: each org has an array of allowed email domains.
-- Users joining via invite must have an email matching one of these domains.
--
-- A NULL value means "no restriction yet" — the first user to join via invite
-- establishes the domain (their email's domain becomes the allowed one).
--
-- Pre-conditions:
-- - Migration 00011 already applied (cleanup + invite_token column).

BEGIN;

-- 1. Add allowed_email_domains column (array of text, lowercased)
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS allowed_email_domains text[];

-- 2. Set Intro to accept both legacy and new staff domains.
--    Vicente has @happydebt.com today; future Intro staff will use @tryintro.com.
UPDATE public.organizations
SET allowed_email_domains = ARRAY['tryintro.com', 'happydebt.com']
WHERE slug = 'intro';

-- 3. Rise stays NULL — the first user to join via invite establishes the domain.
--    (No update needed.)

-- 4. GIN index for fast contains queries (future-proofing for many orgs)
CREATE INDEX IF NOT EXISTS idx_organizations_allowed_email_domains
ON public.organizations USING gin(allowed_email_domains);

COMMIT;
