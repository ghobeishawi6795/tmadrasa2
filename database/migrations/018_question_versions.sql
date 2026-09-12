-- 018_question_versions.sql
-- Ports item 2 from the دبستان question-bank comparison: editing a question
-- must not retroactively change an exam a student has already been given
-- (or is mid-attempt on). Every create/edit of a question now freezes a
-- full snapshot into question_versions; exam_questions.pinned_version
-- records which snapshot that exam was attached with.
--
-- No data backfill here on purpose -- see _shared/question-versions.js:
-- snapshots are created lazily (at question-create time, at question-edit
-- time, and at attach-to-exam time if one doesn't exist yet), which
-- handles pre-existing questions correctly without a fragile SQL backfill.
-- exam_questions rows that already existed before this migration keep
-- pinned_version = NULL forever and fall back to live-table behavior,
-- same as before this migration existed.
--
-- This also LIFTS the previous restriction in teacher/questions.js that
-- blocked editing a question entirely once it was used in any exam -- that
-- restriction existed only because there was no versioning yet. Editing is
-- now always allowed; it creates a new version instead of mutating history.

ALTER TABLE questions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exam_questions ADD COLUMN pinned_version INTEGER;

CREATE TABLE question_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    correct_boolean INTEGER,
    correct_numeric REAL,
    numeric_tolerance REAL,
    correct_text TEXT,
    options_json TEXT, -- multiple_choice only: [{local_id, text, is_correct}, ...]
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (question_id, version)
);
CREATE INDEX idx_question_versions_lookup ON question_versions(question_id, version);
