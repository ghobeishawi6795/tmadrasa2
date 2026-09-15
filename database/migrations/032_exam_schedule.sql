CREATE TABLE IF NOT EXISTS exam_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  room TEXT,
  scheduled_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(exam_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_school_date ON exam_schedules(school_id,scheduled_date,start_time);
