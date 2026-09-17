-- Adds the permission keys for the new admin/grade-periods.js CRUD.
-- grade_periods (migration 007) has been read everywhere -- grade sync,
-- parent/student report-card filtering -- since it was created, but until
-- now nothing could ever create a row in it. This just adds the
-- permissions; the endpoint itself is new application code, not a schema
-- change.
INSERT OR IGNORE INTO permissions (key) VALUES
    ('grade_periods.view'), ('grade_periods.manage');

-- admin: full manage + view (permissions added by a migration are NOT
-- retroactively granted by migration 002's one-time admin CROSS JOIN --
-- that only covered permissions that existed at the time IT ran, so every
-- migration since has explicitly granted its own new permissions, same as
-- here)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'admin'), id FROM permissions
WHERE key IN ('grade_periods.view', 'grade_periods.manage');

-- teacher/student/parent: view only (so they can populate a period filter
-- on report cards/grade views) -- never manage.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key IN ('teacher', 'student', 'parent') AND p.key = 'grade_periods.view';
