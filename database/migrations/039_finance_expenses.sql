CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  title TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL CHECK(amount > 0),
  spent_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_school_date ON expenses(school_id,spent_at);
