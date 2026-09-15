-- TOTP replay protection: remember the last accepted 30-second time-step per
-- user so a captured/observed 6-digit code cannot be reused within its
-- validity window (previously any code valid for the whole ±1 step window,
-- ~90s, could be replayed since nothing recorded that it had been used).
ALTER TABLE users ADD COLUMN totp_last_step INTEGER;
