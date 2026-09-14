-- Security/integrity hardening.

INSERT OR IGNORE INTO permissions (key) VALUES ('parents.view');
INSERT OR IGNORE INTO permissions (key) VALUES ('parent_students.view');

CREATE TABLE IF NOT EXISTS registration_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_registration_attempts_ip ON registration_attempts(ip_address, created_at);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('parents.view', 'parent_students.view');

-- Assignment attempts must be unique. A trigger is used instead of a unique
-- index so existing databases containing historical duplicate attempt numbers
-- can still migrate without destructive cleanup.
CREATE TRIGGER IF NOT EXISTS trg_submissions_unique_attempt
BEFORE INSERT ON submissions
WHEN EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.assignment_id = NEW.assignment_id
      AND s.student_id = NEW.student_id
      AND s.attempt_number = NEW.attempt_number
)
BEGIN
    SELECT RAISE(ABORT, 'duplicate assignment attempt');
END;

-- Grade weights are part of grade arithmetic and must be finite/positive.
CREATE TRIGGER IF NOT EXISTS trg_grades_valid_weight_insert
BEFORE INSERT ON grades
WHEN NEW.weight IS NULL OR NEW.weight <= 0
BEGIN
    SELECT RAISE(ABORT, 'invalid grade weight');
END;

CREATE TRIGGER IF NOT EXISTS trg_grades_valid_weight_update
BEFORE UPDATE OF weight ON grades
WHEN NEW.weight IS NULL OR NEW.weight <= 0
BEGIN
    SELECT RAISE(ABORT, 'invalid grade weight');
END;

-- A synced source should represent one grade row per student/subject/source/source_id.
-- source_id NULL is intentionally excluded because manual grades may be independent.
CREATE TRIGGER IF NOT EXISTS trg_grades_unique_source
BEFORE INSERT ON grades
WHEN NEW.source_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM grades g
    WHERE g.student_id = NEW.student_id
      AND g.subject_id = NEW.subject_id
      AND g.source = NEW.source
      AND g.source_id = NEW.source_id
)
BEGIN
    SELECT RAISE(ABORT, 'duplicate grade source');
END;

CREATE TRIGGER IF NOT EXISTS trg_super_admin_singleton
BEFORE INSERT ON user_roles
WHEN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE r.key = 'super_admin'
)
AND EXISTS (
    SELECT 1 FROM roles r2 WHERE r2.id = NEW.role_id AND r2.key = 'super_admin'
)
BEGIN
    SELECT RAISE(ABORT, 'super_admin already exists');
END;
