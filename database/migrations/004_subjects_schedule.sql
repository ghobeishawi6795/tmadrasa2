-- 004_subjects_schedule.sql
CREATE TABLE subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    name TEXT NOT NULL,
    grade TEXT,
    deleted_at TEXT
);

CREATE TABLE teaching_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    class_id INTEGER NOT NULL REFERENCES classes(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    UNIQUE(teacher_id, class_id, subject_id)
);

CREATE TABLE schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    class_id INTEGER NOT NULL REFERENCES classes(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    day_of_week INTEGER NOT NULL, -- 0=Saturday ... 6=Friday
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
);

CREATE INDEX idx_subjects_school ON subjects(school_id);
CREATE INDEX idx_teaching_assignments_teacher ON teaching_assignments(teacher_id);
