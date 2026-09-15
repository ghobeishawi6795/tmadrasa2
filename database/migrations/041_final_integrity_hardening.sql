-- Final integrity hardening: enforce same-school ownership at the database layer.
-- No data is moved or deleted by this migration.

UPDATE academic_years SET is_current=0
WHERE is_current=1
  AND id NOT IN (SELECT MAX(id) FROM academic_years WHERE is_current=1 GROUP BY school_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_single_current
ON academic_years(school_id) WHERE is_current = 1;

CREATE TRIGGER IF NOT EXISTS trg_student_fees_same_school_insert
BEFORE INSERT ON student_fees
WHEN (SELECT school_id FROM fee_items WHERE id = NEW.fee_item_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id = NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'student fee school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_student_fees_same_school_update
BEFORE UPDATE OF school_id, fee_item_id, student_id ON student_fees
WHEN (SELECT school_id FROM fee_items WHERE id = NEW.fee_item_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id = NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'student fee school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_payments_same_school_insert
BEFORE INSERT ON payments
WHEN (SELECT school_id FROM student_fees WHERE id = NEW.student_fee_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'payment school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_library_loans_same_school_insert
BEFORE INSERT ON library_loans
WHEN (SELECT school_id FROM library_books WHERE id = NEW.book_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id = NEW.student_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'library loan school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_parent_requests_same_school_insert
BEFORE INSERT ON parent_requests
WHEN (SELECT school_id FROM parents WHERE id = NEW.parent_id) IS NOT NEW.school_id
  OR (NEW.student_id IS NOT NULL AND (SELECT school_id FROM students WHERE id = NEW.student_id) IS NOT NEW.school_id)
BEGIN SELECT RAISE(ABORT, 'parent request school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_parent_meetings_same_school_insert
BEFORE INSERT ON parent_meetings
WHEN (SELECT school_id FROM teachers WHERE id = NEW.teacher_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM students WHERE id = NEW.student_id) IS NOT NEW.school_id
  OR (SELECT school_id FROM parents WHERE id = NEW.parent_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'parent meeting school mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_exam_schedules_same_school_insert
BEFORE INSERT ON exam_schedules
WHEN (SELECT school_id FROM exams WHERE id = NEW.exam_id) IS NOT NEW.school_id
BEGIN SELECT RAISE(ABORT, 'exam schedule school mismatch'); END;


CREATE TRIGGER IF NOT EXISTS trg_library_loan_decrement_book
AFTER INSERT ON library_loans
BEGIN
  UPDATE library_books SET available_copies=available_copies-1
  WHERE id=NEW.book_id AND school_id=NEW.school_id AND available_copies>0;
END;

CREATE TRIGGER IF NOT EXISTS trg_library_loan_available
BEFORE INSERT ON library_loans
WHEN (SELECT available_copies FROM library_books WHERE id=NEW.book_id AND school_id=NEW.school_id) < 1
BEGIN
  SELECT RAISE(ABORT, 'library book unavailable');
END;
