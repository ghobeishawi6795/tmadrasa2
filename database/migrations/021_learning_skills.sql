-- 021_learning_skills.sql
-- Ports the skill-linking part of item 6 from the دبستان comparison.
-- Kept deliberately simpler than دبستان's own learning_skills (no
-- hierarchical parent_id/code/grade columns) -- مدرسه has no skill-based
-- report-card integration to justify that structure yet; this is just
-- "tag a question with which skill it exercises", which is what the
-- ranked list actually asked for.

CREATE TABLE learning_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_learning_skills_teacher ON learning_skills(teacher_id, is_active);

CREATE TABLE question_skills (
    question_id INTEGER NOT NULL REFERENCES questions(id),
    skill_id INTEGER NOT NULL REFERENCES learning_skills(id),
    weight REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (question_id, skill_id)
);
CREATE INDEX idx_question_skills_skill ON question_skills(skill_id);
