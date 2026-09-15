-- Lightweight SaaS subscription state. Payment gateways are intentionally not embedded.
ALTER TABLE schools ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE schools ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE schools ADD COLUMN subscription_expires_at TEXT;
ALTER TABLE schools ADD COLUMN trial_ends_at TEXT;
CREATE INDEX IF NOT EXISTS idx_schools_subscription ON schools(subscription_status,subscription_expires_at);
