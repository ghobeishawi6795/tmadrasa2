-- 052_exam_school_integrity.sql
-- exams was the one central linking table (class_id + subject_id + teacher_id)
-- that never got a same-school guard, unlike its ~15 sibling tables
-- (teaching_assignments, library_loans, sessions, parent_meetings, etc. --
-- see migrations 041-048). The app layer already prevents this via
-- assertClassOwnedByTeacher/assertTeacherTeachesSubjectInClass in
-- teacher/exams.js, and exam edits can never change class_id/subject_id --
-- so this is defense-in-depth, not a fix for an active exploit. Found
-- during a real-SQLite trigger-simulation pass, 2026-09-18.

CREATE TRIGGER IF NOT EXISTS trg_exams_same_school_insert
BEFORE INSERT ON exams
WHEN (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM subjects WHERE id=NEW.subject_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'exam school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exams_same_school_update
BEFORE UPDATE OF school_id,class_id,subject_id,teacher_id ON exams
WHEN (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM subjects WHERE id=NEW.subject_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'exam school mismatch'); END;
