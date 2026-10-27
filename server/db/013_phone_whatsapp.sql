-- =====================================================================
-- Mobile number at signup + WhatsApp consent
--  * whatsapp_consent_at: when the person agreed to WhatsApp messages
--    (NULL = no consent). Kept alongside notify_whatsapp as a record of
--    when consent was given.
-- =====================================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ;

-- Anyone who already switched WhatsApp on counts as having agreed at that time
UPDATE user_profiles SET whatsapp_consent_at = updated_at
WHERE notify_whatsapp AND whatsapp_consent_at IS NULL;
