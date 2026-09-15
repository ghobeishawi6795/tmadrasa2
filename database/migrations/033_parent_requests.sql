CREATE TABLE IF NOT EXISTS parent_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  student_id INTEGER REFERENCES students(id),
  type TEXT NOT NULL CHECK(type IN ('leave','certificate','transfer','profile_change','meeting','report_card','other')),
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','completed')),
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parent_requests_school ON parent_requests(school_id,status,created_at);
