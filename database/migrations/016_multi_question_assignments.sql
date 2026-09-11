-- 016_multi_question_assignments.sql
-- Lets ONE assignment ("تکلیف") bundle MANY sub-questions, so importing a
-- 30-question HTML file creates a single assignment the student opens once
-- (with the questions inside, one after another) instead of 30 separate
-- assignment rows. Existing single-question assignments are untouched and
-- keep working exactly as before via the old submission_type/question_payload
-- columns on `assignments` -- is_multi_question is what tells the app which
-- mode a given assignment is in.
--
-- Also adds `prompt_style`/`prompt_html`/`prompt_text` columns so the
-- original imported HTML (colors, layout, icons -- whatever the teacher's
-- AI-generated file looked like) can be shown to the student instead of a
-- plain/dry re-typed version. This is rendered client-side inside a fully
-- sandboxed <iframe> (no scripts allowed to run at all), so it's safe to
-- store fairly permissively -- see html-import.js for the one exception:
-- for match/drag_drop questions the answer-bearing lists are stripped out
-- of the stored HTML before this migration's data is ever written, same
-- security reasoning as sanitizeForStudent() in _shared/interactive.js.

ALTER TABLE assignments ADD COLUMN is_multi_question INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN prompt_style TEXT; -- shared <style> block extracted from the imported file, or NULL

CREATE TABLE assignment_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id),
    order_index INTEGER NOT NULL,
    submission_type TEXT NOT NULL, -- text | photo | audio | draw | match | drag_drop
    question_payload TEXT,         -- match/drag_drop answer key -- same shape/handling as assignments.question_payload, never sent to students as-is
    prompt_html TEXT,              -- sanitized original per-question HTML block, rendered read-only in a sandboxed iframe
    prompt_text TEXT,              -- plain-text instructions, always safe, shown above the iframe as a fallback/summary
    weight REAL NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assignment_questions_assignment ON assignment_questions(assignment_id);

CREATE TABLE submission_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id),
    assignment_question_id INTEGER NOT NULL REFERENCES assignment_questions(id),
    answer_data TEXT,
    score REAL,
    max_score REAL NOT NULL DEFAULT 1,
    needs_manual_review INTEGER NOT NULL DEFAULT 1,
    feedback TEXT,
    graded_at TEXT
);
CREATE INDEX idx_submission_answers_submission ON submission_answers(submission_id);
CREATE UNIQUE INDEX idx_submission_answers_unique ON submission_answers(submission_id, assignment_question_id);
