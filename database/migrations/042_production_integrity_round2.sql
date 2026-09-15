-- Production integrity round 2: close remaining cross-school and race/consistency gaps.

-- A fee item may only belong to the same school/year as its fee record.
CREATE TRIGGER IF NOT EXISTS trg_fee_items_academic_year_same_school_insert
BEFORE INSERT ON fee_items
WHEN NEW.academic_year_id IS NOT NULL
 AND (SELECT school_id FROM academic_years WHERE id=NEW.academic_year_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'fee item academic year school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_fee_items_academic_year_same_school_update
BEFORE UPDATE OF school_id, academic_year_id ON fee_items
WHEN NEW.academic_year_id IS NOT NULL
 AND (SELECT school_id FROM academic_years WHERE id=NEW.academic_year_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'fee item academic year school mismatch'); END;

-- Prevent mutation of payment ownership across schools.
CREATE TRIGGER IF NOT EXISTS trg_payments_same_school_update
BEFORE UPDATE OF school_id, student_fee_id ON payments
WHEN (SELECT school_id FROM student_fees WHERE id=NEW.student_fee_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'payment school mismatch'); END;

-- Prevent mutation of library-loan ownership across schools.
CREATE TRIGGER IF NOT EXISTS trg_library_loans_same_school_update
BEFORE UPDATE OF school_id, book_id, student_id ON library_loans
WHEN (SELECT school_id FROM library_books WHERE id=NEW.book_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'library loan school mismatch'); END;

-- Prevent mutation of parent request ownership across schools.
CREATE TRIGGER IF NOT EXISTS trg_parent_requests_same_school_update
BEFORE UPDATE OF school_id, parent_id, student_id ON parent_requests
WHEN (SELECT school_id FROM parents WHERE id=NEW.parent_id) IS NOT NEW.school_id
  OR (NEW.student_id IS NOT NULL AND (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id)
BEGIN SELECT RAISE(ABORT, 'parent request school mismatch'); END;

-- Prevent mutation of meeting ownership across schools.
CREATE TRIGGER IF NOT EXISTS trg_parent_meetings_same_school_update
BEFORE UPDATE OF school_id, teacher_id, student_id, parent_id ON parent_meetings
WHEN (SELECT school_id FROM teachers WHERE id=NEW.teacher_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id=NEW.student_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM parents WHERE id=NEW.parent_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'parent meeting school mismatch'); END;

-- A teacher/parent/student cannot have overlapping active meetings.
CREATE TRIGGER IF NOT EXISTS trg_parent_meetings_no_overlap_insert
BEFORE INSERT ON parent_meetings
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM parent_meetings m
  WHERE m.school_id=NEW.school_id AND m.status <> 'cancelled'
    AND (m.teacher_id=NEW.teacher_id OR m.parent_id=NEW.parent_id OR m.student_id=NEW.student_id)
    AND julianday(NEW.scheduled_at) < julianday(m.scheduled_at, '+' || NEW.duration_minutes || ' minutes')
    AND julianday(m.scheduled_at) < julianday(NEW.scheduled_at, '+' || m.duration_minutes || ' minutes')
)
BEGIN SELECT RAISE(ABORT, 'meeting time conflicts with another active meeting'); END;

CREATE TRIGGER IF NOT EXISTS trg_parent_meetings_no_overlap_update
BEFORE UPDATE OF scheduled_at, duration_minutes, teacher_id, parent_id, student_id, status ON parent_meetings
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM parent_meetings m
  WHERE m.id<>NEW.id AND m.school_id=NEW.school_id AND m.status <> 'cancelled'
    AND (m.teacher_id=NEW.teacher_id OR m.parent_id=NEW.parent_id OR m.student_id=NEW.student_id)
    AND julianday(NEW.scheduled_at) < julianday(m.scheduled_at, '+' || NEW.duration_minutes || ' minutes')
    AND julianday(m.scheduled_at) < julianday(NEW.scheduled_at, '+' || m.duration_minutes || ' minutes')
)
BEGIN SELECT RAISE(ABORT, 'meeting time conflicts with another active meeting'); END;

-- Protect exam attempt numbering under concurrent starts.
CREATE TRIGGER IF NOT EXISTS trg_exam_attempt_unique_number
BEFORE INSERT ON exam_attempts
WHEN EXISTS (
  SELECT 1 FROM exam_attempts a
  WHERE a.exam_id=NEW.exam_id AND a.student_id=NEW.student_id AND a.attempt_number=NEW.attempt_number
)
BEGIN SELECT RAISE(ABORT, 'duplicate exam attempt number'); END;


CREATE TRIGGER IF NOT EXISTS trg_academic_year_valid_insert
BEFORE INSERT ON academic_years
WHEN NEW.start_date >= NEW.end_date OR NEW.status NOT IN ('open','closed','archived')
BEGIN SELECT RAISE(ABORT, 'invalid academic year'); END;

CREATE TRIGGER IF NOT EXISTS trg_academic_year_valid_update
BEFORE UPDATE OF start_date, end_date, status ON academic_years
WHEN NEW.start_date >= NEW.end_date OR NEW.status NOT IN ('open','closed','archived')
BEGIN SELECT RAISE(ABORT, 'invalid academic year'); END;

CREATE TRIGGER IF NOT EXISTS trg_fee_items_valid_amount_insert
BEFORE INSERT ON fee_items
WHEN NEW.amount IS NULL OR NEW.amount < 0
BEGIN SELECT RAISE(ABORT, 'invalid fee amount'); END;

CREATE TRIGGER IF NOT EXISTS trg_fee_items_valid_amount_update
BEFORE UPDATE OF amount ON fee_items
WHEN NEW.amount IS NULL OR NEW.amount < 0
BEGIN SELECT RAISE(ABORT, 'invalid fee amount'); END;
