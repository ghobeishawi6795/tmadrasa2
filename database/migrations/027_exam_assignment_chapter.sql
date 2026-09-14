-- Optional "فصل اصلی" (primary chapter) on exams and assignments, chosen by
-- the teacher at creation time. Nullable -- an exam/assignment with no
-- chapter set (e.g. one created via HTML import) simply falls under a
-- "بدون فصل" grouping in the teacher's list UI. No FK enforcement (SQLite
-- ADD COLUMN can't add a real FK after the fact cleanly), ownership/subject
-- match is checked in application code on write, same pattern as
-- questions.chapter/chapters table.
ALTER TABLE exams ADD COLUMN chapter_id INTEGER;
ALTER TABLE assignments ADD COLUMN chapter_id INTEGER;
