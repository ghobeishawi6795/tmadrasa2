-- 006_exams.sql : full exam system
CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    class_id INTEGER NOT NULL REFERENCES classes(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'quiz',
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft', -- draft|published|closed|archived
    published_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    subject_id INTEGER REFERENCES subjects(id),
    type TEXT NOT NULL, -- multiple_choice|true_false|numeric|short_answer|long_answer
    text TEXT NOT NULL,
    correct_option_id INTEGER, -- for multiple_choice, filled after options exist
    correct_boolean INTEGER,   -- for true_false
    correct_numeric REAL,      -- for numeric
    numeric_tolerance REAL DEFAULT 0,
    correct_text TEXT,         -- reference text for short_answer (manual review still required)
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE question_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE exam_questions (
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    question_id INTEGER NOT NULL REFERENCES questions(id),
    position INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (exam_id, question_id)
);

CREATE TABLE exam_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress|submitted|graded
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_at TEXT,
    auto_score REAL NOT NULL DEFAULT 0,
    manual_score REAL NOT NULL DEFAULT 0,
    total_score REAL,
    max_score REAL,
    UNIQUE(exam_id, student_id, attempt_number)
);

CREATE TABLE exam_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id),
    question_id INTEGER NOT NULL REFERENCES questions(id),
    selected_option_id INTEGER,
    boolean_answer INTEGER,
    numeric_answer REAL,
    text_answer TEXT,
    is_correct INTEGER,        -- NULL until graded (manual types stay NULL until reviewed)
    score REAL,
    needs_manual_review INTEGER NOT NULL DEFAULT 0,
    feedback TEXT,
    UNIQUE(attempt_id, question_id)
);

CREATE INDEX idx_exams_class ON exams(class_id);
CREATE INDEX idx_exams_school ON exams(school_id);
CREATE INDEX idx_questions_teacher ON questions(teacher_id);
CREATE INDEX idx_exam_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX idx_exam_attempts_student ON exam_attempts(student_id);
