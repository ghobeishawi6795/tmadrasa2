-- 015_super_admin.sql
-- Adds a "super_admin" role that sits above every school, plus a special
-- system school (id=0) purely to satisfy users.school_id's NOT NULL
-- constraint for accounts that don't belong to any real school. This
-- school is never shown to anyone, has active=0, and is excluded from
-- every super-admin listing/report query by filtering `id != 0`.

INSERT INTO schools (id, name, active) VALUES (0, 'سیستم (سوپرادمین)', 0);

INSERT INTO roles (key, label) VALUES ('super_admin', 'سوپرادمین');

-- The super-admin dashboard sends/reads messages through the existing,
-- unchanged /api/messages/messages endpoint (see functions/api/superadmin/
-- messages.js for why) -- that endpoint gates on these two permissions,
-- so super_admin needs them granted like any other role.
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'super_admin'), id
FROM permissions WHERE key IN ('messages.view', 'messages.create');
