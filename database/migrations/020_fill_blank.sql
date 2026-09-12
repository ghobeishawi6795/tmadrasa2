-- 020_fill_blank.sql
-- Adds the `fill_blank` question type (short, exact-answer text -- e.g.
-- "پایتخت ایران ___ است") to the exam question bank. Unlike short_answer/
-- long_answer (always manual) and multiple_choice/true_false/numeric
-- (always auto), fill_blank's grading is the teacher's own choice per
-- question -- hence the new `grading_mode` column instead of a hardcoded
-- rule in code.
--
-- `correct_text` (already existed) is reused to hold fill_blank's answer
-- key, as a comma-separated list of acceptable answers (same storage
-- convention as `tags`) -- so a teacher can accept "تهران" AND "تهرون".
-- Matching is done via the same Persian-text normalization already ported
-- for search (_shared/search-normalize.js), not a raw string compare.

ALTER TABLE questions ADD COLUMN grading_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE question_versions ADD COLUMN grading_mode TEXT;
