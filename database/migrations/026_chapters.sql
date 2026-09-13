-- A "chapter" used to only ever exist implicitly -- whatever free text a
-- teacher typed into a question's فصل field, with a tab only appearing once
-- at least one question actually used that text (see the old
-- promptNewChapterTab() comment in teacher/index.html for why). This table
-- makes a chapter a real, manageable thing: a teacher can create an empty
-- chapter tab up front (e.g. to bulk-import a ready file into afterwards)
-- and give it a description. questions.chapter stays a plain TEXT column
-- (no FK) -- keeping the join text-based, not by id, avoids a data
-- migration for every question ever created before this table existed;
-- the app keeps the two in sync going forward (see chapters.js).
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    name TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(teacher_id, subject_id, name)
);
CREATE INDEX idx_chapters_teacher_subject ON chapters(teacher_id, subject_id);
