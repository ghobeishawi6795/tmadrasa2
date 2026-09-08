-- 007_grades_attendance.sql
CREATE TABLE grade_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    name TEXT NOT NULL,
    start_at TEXT,
    end_at TEXT
);

CREATE TABLE grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    grade_period_id INTEGER REFERENCES grade_periods(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    source TEXT NOT NULL, -- assignment|exam|manual|final
    source_id INTEGER,
    score REAL NOT NULL CHECK (score >= 0),
    max_score REAL NOT NULL CHECK (max_score > 0),
    weight REAL NOT NULL DEFAULT 1,
    feedback TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (score <= max_score)
);

CREATE TABLE attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    class_id INTEGER NOT NULL REFERENCES classes(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    session_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(class_id, session_date)
);

CREATE TABLE attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES attendance_sessions(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    status TEXT NOT NULL, -- present|absent|late|excused
    UNIQUE(session_id, student_id)
);

CREATE INDEX idx_grades_student ON grades(student_id);
CREATE INDEX idx_attendance_records_student ON attendance_records(student_id);
