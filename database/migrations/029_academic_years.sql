-- Academic years + historical class enrollment.
CREATE TABLE IF NOT EXISTS academic_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','archived')),
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_academic_years_school ON academic_years(school_id, is_current);

ALTER TABLE classes ADD COLUMN academic_year_id INTEGER REFERENCES academic_years(id);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','promoted','transferred','graduated','withdrawn')),
  joined_at TEXT,
  left_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(academic_year_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class ON student_enrollments(class_id, academic_year_id);

-- Keep existing schools/classes usable: create one current academic year per school and attach existing classes.
INSERT OR IGNORE INTO academic_years (school_id,name,start_date,end_date,status,is_current)
SELECT id, 'سال تحصیلی جاری', date('now','-180 days'), date('now','+185 days'), 'open', 1 FROM schools;
UPDATE classes SET academic_year_id = (
  SELECT ay.id FROM academic_years ay WHERE ay.school_id = classes.school_id AND ay.is_current = 1 ORDER BY ay.id DESC LIMIT 1
) WHERE academic_year_id IS NULL;
INSERT OR IGNORE INTO student_enrollments (school_id, academic_year_id, student_id, class_id, status, joined_at)
SELECT cs.school_id, c.academic_year_id, cs.student_id, cs.class_id, 'active', datetime('now')
FROM class_students cs JOIN classes c ON c.id = cs.class_id
WHERE c.academic_year_id IS NOT NULL;
