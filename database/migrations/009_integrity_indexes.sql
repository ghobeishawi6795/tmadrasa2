-- 009_integrity_indexes.sql : extra reporting/perf indexes
CREATE INDEX IF NOT EXISTS idx_class_students_school ON class_students(school_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_school ON class_teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_school ON parent_students(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_school ON attendance_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_school ON conversation_members(school_id);
-- NOTE: D1/SQLite has no native cross-table CHECK trigger for "school_id must match
-- across a join" (e.g. class.school_id == exam.school_id). This is enforced in
-- application code (see _shared/ownership.js) on every write. Keep it that way —
-- do not rely on foreign keys alone for school isolation.
