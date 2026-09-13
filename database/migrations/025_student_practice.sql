-- Adds the "تمرین" (practice) feature: a teacher flags specific bank
-- questions as practice-only, students then answer them ungraded (never
-- touches `grades`), and can revisit their own last result per question.

ALTER TABLE questions ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;

-- One row per (student, question) -- a *repeat* answer UPDATEs this same
-- row (ON CONFLICT upsert in the API) instead of appending, so the table
-- never grows per attempt the way exam_answers does. is_correct is NULL
-- for manually-graded types (short_answer/long_answer/custom_html/fill_blank
-- in manual mode) where there is no automatic right/wrong to record.
CREATE TABLE student_practice_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    question_id INTEGER NOT NULL REFERENCES questions(id),
    is_correct INTEGER,
    answered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, question_id)
);

INSERT INTO permissions (key) VALUES ('practice.use');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'student'), id FROM permissions WHERE key = 'practice.use';
