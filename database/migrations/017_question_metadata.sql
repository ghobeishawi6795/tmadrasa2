-- 017_question_metadata.sql
-- Ports the question-bank metadata fields from the دبستان project's
-- question_bank table onto مدرسه's own `questions` table (used by the
-- teacher's exam question bank). Purely additive -- every new column is
-- nullable/has a safe default, so existing questions and existing code
-- that does `SELECT *` keep working unchanged.
--
-- chapter/topic: free-text organization hooks (e.g. "فصل ۴" / "اندازه‌گیری")
-- explanation: shown to the student AFTER they answer (never before --
--              teacher/questions.js and student/exam-attempt.js must both
--              respect this, same principle as never leaking correct_* early)
-- tags: comma-separated free text, matches دبستان's own storage convention
--       (dabestan's list-questions.js does a comma-wrapped LIKE match on
--       this exact shape -- kept identical so any future tag-filter code
--       here can copy that same query pattern)
-- difficulty: free text but the app only ever writes 'easy'|'medium'|'hard'
--             (enforced in teacher/questions.js, not a DB CHECK, so a
--             future difficulty level doesn't require a migration)

ALTER TABLE questions ADD COLUMN chapter TEXT;
ALTER TABLE questions ADD COLUMN topic TEXT;
ALTER TABLE questions ADD COLUMN explanation TEXT;
ALTER TABLE questions ADD COLUMN tags TEXT;
ALTER TABLE questions ADD COLUMN difficulty TEXT;
