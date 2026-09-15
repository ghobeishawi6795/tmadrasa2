-- Deep integrity hardening: keep linked records inside one school and keep
-- enrollments aligned with their academic year/class. No new feature.

CREATE TRIGGER IF NOT EXISTS trg_sessions_same_user_school_insert
BEFORE INSERT ON sessions
WHEN (SELECT school_id FROM users WHERE id=NEW.user_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'session user school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_sessions_same_user_school_update
BEFORE UPDATE OF user_id, school_id ON sessions
WHEN (SELECT school_id FROM users WHERE id=NEW.user_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'session user school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_student_enrollment_integrity_insert
BEFORE INSERT ON student_enrollments
WHEN (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM academic_years WHERE id=NEW.academic_year_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT academic_year_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.academic_year_id
BEGIN SELECT RAISE(ABORT, 'student enrollment ownership/year mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_student_enrollment_integrity_update
BEFORE UPDATE OF school_id, academic_year_id, student_id, class_id ON student_enrollments
WHEN (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM academic_years WHERE id=NEW.academic_year_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.school_id
  OR (SELECT academic_year_id FROM classes WHERE id=NEW.class_id) IS NOT NEW.academic_year_id
BEGIN SELECT RAISE(ABORT, 'student enrollment ownership/year mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_submissions_same_school_insert
BEFORE INSERT ON submissions
WHEN (SELECT school_id FROM assignments WHERE id=NEW.assignment_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'submission school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_submissions_same_school_update
BEFORE UPDATE OF school_id, assignment_id, student_id ON submissions
WHEN (SELECT school_id FROM assignments WHERE id=NEW.assignment_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'submission school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exam_attempt_same_school_insert
BEFORE INSERT ON exam_attempts
WHEN (SELECT school_id FROM exams WHERE id=NEW.exam_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'exam attempt school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exam_attempt_same_school_update
BEFORE UPDATE OF school_id, exam_id, student_id ON exam_attempts
WHEN (SELECT school_id FROM exams WHERE id=NEW.exam_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'exam attempt school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exam_questions_same_school_insert
BEFORE INSERT ON exam_questions
WHEN (SELECT school_id FROM exams WHERE id=NEW.exam_id) IS NOT (SELECT school_id FROM questions WHERE id=NEW.question_id)
BEGIN SELECT RAISE(ABORT, 'exam question school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exam_answers_same_attempt_question_insert
BEFORE INSERT ON exam_answers
WHEN (SELECT exam_id FROM exam_attempts WHERE id=NEW.attempt_id) IS NULL
  OR (SELECT school_id FROM questions WHERE id=NEW.question_id) IS NOT (SELECT school_id FROM exam_attempts WHERE id=NEW.attempt_id)
  OR NOT EXISTS (SELECT 1 FROM exam_questions eq JOIN exam_attempts ea ON ea.exam_id=eq.exam_id WHERE ea.id=NEW.attempt_id AND eq.question_id=NEW.question_id)
BEGIN SELECT RAISE(ABORT, 'exam answer question mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exam_answers_same_attempt_question_update
BEFORE UPDATE OF attempt_id, question_id ON exam_answers
WHEN (SELECT school_id FROM questions WHERE id=NEW.question_id) IS NOT (SELECT school_id FROM exam_attempts WHERE id=NEW.attempt_id)
  OR NOT EXISTS (SELECT 1 FROM exam_questions eq JOIN exam_attempts ea ON ea.exam_id=eq.exam_id WHERE ea.id=NEW.attempt_id AND eq.question_id=NEW.question_id)
BEGIN SELECT RAISE(ABORT, 'exam answer question mismatch'); END;
