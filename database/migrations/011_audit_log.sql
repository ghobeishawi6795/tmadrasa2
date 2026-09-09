-- 011_audit_log.sql : append-only log of sensitive actions
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER,                    -- NULL only for pre-school-creation events (none currently)
    actor_user_id INTEGER,                -- NULL for unauthenticated/system actions
    action TEXT NOT NULL,                 -- e.g. 'school.register', 'student.create', 'exam.publish'
    entity_type TEXT,                     -- e.g. 'student', 'exam', 'class'
    entity_id INTEGER,
    meta TEXT,                            -- JSON string, free-form details (kept small, no secrets)
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_school ON audit_log(school_id, created_at);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at);
