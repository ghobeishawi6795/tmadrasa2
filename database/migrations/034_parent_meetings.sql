CREATE TABLE IF NOT EXISTS parent_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 20 CHECK(duration_minutes BETWEEN 5 AND 180),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','completed','cancelled')),
  topic TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parent_meetings_teacher ON parent_meetings(school_id,teacher_id,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_parent_meetings_parent ON parent_meetings(school_id,parent_id,scheduled_at);
