-- 003_people_classes.sql
CREATE TABLE teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    specialty TEXT,
    deleted_at TEXT
);

CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    student_code TEXT,
    deleted_at TEXT
);

CREATE TABLE parents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    deleted_at TEXT
);

CREATE TABLE parent_students (
    parent_id INTEGER NOT NULL REFERENCES parents(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    PRIMARY KEY (parent_id, student_id)
);

CREATE TABLE classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    name TEXT NOT NULL,
    grade TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE class_students (
    class_id INTEGER NOT NULL REFERENCES classes(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    PRIMARY KEY (class_id, student_id)
);

CREATE TABLE class_teachers (
    class_id INTEGER NOT NULL REFERENCES classes(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    PRIMARY KEY (class_id, teacher_id)
);

CREATE INDEX idx_students_school ON students(school_id);
CREATE INDEX idx_teachers_school ON teachers(school_id);
CREATE INDEX idx_classes_school ON classes(school_id);
