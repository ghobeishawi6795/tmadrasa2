CREATE TABLE IF NOT EXISTS library_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  category TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1 CHECK(total_copies >= 0),
  available_copies INTEGER NOT NULL DEFAULT 1 CHECK(available_copies >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS library_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  book_id INTEGER NOT NULL REFERENCES library_books(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  borrowed_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_at TEXT,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'borrowed' CHECK(status IN ('borrowed','returned','lost'))
);
CREATE INDEX IF NOT EXISTS idx_library_loans_student ON library_loans(school_id,student_id,status);
