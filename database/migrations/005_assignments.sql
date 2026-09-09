-- 005_assignments.sql
CREATE TABLE assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    class_id INTEGER NOT NULL REFERENCES classes(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    title TEXT NOT NULL,
    description TEXT,
    due_at TEXT NOT NULL,
    allow_late INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    max_score REAL NOT NULL DEFAULT 20,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE assignment_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL
);

CREATE TABLE submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    assignment_id INTEGER NOT NULL REFERENCES assignments(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    attempt_number INTEGER NOT NULL DEFAULT 1,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'submitted', -- submitted | late | graded
    score REAL,
    feedback TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    graded_at TEXT
);

CREATE TABLE submission_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL
);

CREATE INDEX idx_assignments_class ON assignments(class_id);
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student ON submissions(student_id);
