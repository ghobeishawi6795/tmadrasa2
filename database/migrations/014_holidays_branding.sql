-- 014_holidays_branding.sql
-- Phase 2 remainder: school holiday calendar + per-school branding (logo/color).

CREATE TABLE school_holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    holiday_date TEXT NOT NULL,   -- YYYY-MM-DD
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(school_id, holiday_date)
);

CREATE INDEX idx_school_holidays_school ON school_holidays(school_id, holiday_date);

-- Branding: logo stored as base64 in D1 (same pattern as photo/audio submissions --
-- no R2 in this project), capped server-side at a small size since it's just a logo.
ALTER TABLE schools ADD COLUMN logo_data TEXT;       -- base64 image, nullable
ALTER TABLE schools ADD COLUMN primary_color TEXT;   -- hex color e.g. #5b5ce2, nullable

INSERT INTO permissions (key) VALUES
    ('holidays.view'), ('holidays.manage'), ('school.update');

-- admin: full manage + update
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key='admin'), id FROM permissions
WHERE key IN ('holidays.view', 'holidays.manage', 'school.update');

-- teacher/student/parent: read-only holiday calendar (branding read is auth-only,
-- no permission needed -- see /api/school/branding, same pattern as /api/student/me)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, (SELECT id FROM permissions WHERE key='holidays.view')
FROM roles r WHERE r.key IN ('teacher', 'student', 'parent');
