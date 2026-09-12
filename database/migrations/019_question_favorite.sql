-- 019_question_favorite.sql
-- Ports the "favorite" part of item 3 from the دبستان question-bank
-- comparison. Purely additive; a bookmark, not exam content, so toggling
-- it deliberately does NOT go through teacher/questions.js's PUT (which
-- would bump the question's version for no reason -- see 018).

ALTER TABLE questions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
