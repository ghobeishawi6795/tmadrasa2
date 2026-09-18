-- 051_system_settings.sql
-- Generic key/value system settings table, superadmin-controlled.
-- First use: "persistent_login" -- whether the session token survives full
-- browser/app close (localStorage) or is per-tab and lost on close
-- (sessionStorage). Defaults ON (persistent) per superadmin's request
-- 2026-09-18. Toggle lives in superadmin/index.html.

CREATE TABLE system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO system_settings (key, value) VALUES ('persistent_login', '1');

INSERT INTO permissions (key) VALUES ('system_settings.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'super_admin'), id FROM permissions
WHERE key = 'system_settings.manage';
