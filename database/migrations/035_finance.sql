CREATE TABLE IF NOT EXISTS fee_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  due_date TEXT,
  academic_year_id INTEGER REFERENCES academic_years(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS student_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  fee_item_id INTEGER NOT NULL REFERENCES fee_items(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  amount REAL NOT NULL CHECK(amount >= 0),
  discount REAL NOT NULL DEFAULT 0 CHECK(discount >= 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','partial','paid','waived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fee_item_id,student_id)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_fee_id INTEGER NOT NULL REFERENCES student_fees(id),
  amount REAL NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees(school_id,student_id,status);
CREATE INDEX IF NOT EXISTS idx_payments_fee ON payments(student_fee_id,paid_at);
