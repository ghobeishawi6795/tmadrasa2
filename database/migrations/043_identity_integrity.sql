-- Identity integrity hardening: keep role/profile ownership aligned with user school.
-- Super-admin identities use the reserved system school (0).

CREATE TRIGGER IF NOT EXISTS trg_user_roles_same_user_school_insert
BEFORE INSERT ON user_roles
WHEN NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = NEW.user_id
    AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'user role school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_user_roles_same_user_school_update
BEFORE UPDATE OF user_id, school_id ON user_roles
WHEN NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = NEW.user_id
    AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'user role school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_user_same_school_insert
BEFORE INSERT ON teachers
WHEN NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'teacher user school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_user_same_school_update
BEFORE UPDATE OF user_id, school_id ON teachers
WHEN NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'teacher user school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_student_user_same_school_insert
BEFORE INSERT ON students
WHEN NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'student user school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_student_user_same_school_update
BEFORE UPDATE OF user_id, school_id ON students
WHEN NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'student user school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_parent_user_same_school_insert
BEFORE INSERT ON parents
WHEN NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'parent user school mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_parent_user_same_school_update
BEFORE UPDATE OF user_id, school_id ON parents
WHEN NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'parent user school mismatch');
END;
