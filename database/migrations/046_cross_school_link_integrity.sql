-- Regression hardening: enforce school ownership on relationship tables.
-- These are defense-in-depth constraints; APIs must still authorize every operation.

CREATE TRIGGER IF NOT EXISTS trg_parent_students_same_school_insert
BEFORE INSERT ON parent_students
WHEN (SELECT school_id FROM parents WHERE id=NEW.parent_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'parent student school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_parent_students_same_school_update
BEFORE UPDATE OF school_id,parent_id,student_id ON parent_students
WHEN (SELECT school_id FROM parents WHERE id=NEW.parent_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'parent student school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_class_students_same_school_insert
BEFORE INSERT ON class_students
WHEN (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'class student school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_class_students_same_school_update
BEFORE UPDATE OF school_id,class_id,student_id ON class_students
WHEN (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'class student school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_class_teachers_same_school_insert
BEFORE INSERT ON class_teachers
WHEN (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'class teacher school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_class_teachers_same_school_update
BEFORE UPDATE OF school_id,class_id,teacher_id ON class_teachers
WHEN (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'class teacher school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_teaching_assignments_same_school_insert
BEFORE INSERT ON teaching_assignments
WHEN (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM subjects WHERE id=NEW.subject_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'teaching assignment school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_teaching_assignments_same_school_update
BEFORE UPDATE OF school_id,teacher_id,class_id,subject_id ON teaching_assignments
WHEN (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM subjects WHERE id=NEW.subject_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'teaching assignment school mismatch'); END;
