-- Deep integrity hardening: protect mutable cross-table links that can be
-- changed through direct SQL or future code paths. No new feature.

-- An exam question may never be moved to another exam/question pair from a
-- different school after it has been attached.
CREATE TRIGGER IF NOT EXISTS trg_exam_questions_same_school_update
BEFORE UPDATE OF exam_id, question_id ON exam_questions
WHEN (SELECT school_id FROM exams WHERE id=NEW.exam_id) IS NOT (SELECT school_id FROM questions WHERE id=NEW.question_id)
BEGIN SELECT RAISE(ABORT, 'exam question school mismatch'); END;

-- A submission answer must point at a question belonging to the assignment
-- represented by its parent submission. Without this, a valid FK could still
-- link a student's submission to a question from another assignment.
CREATE TRIGGER IF NOT EXISTS trg_submission_answers_same_assignment_insert
BEFORE INSERT ON submission_answers
WHEN (SELECT assignment_id FROM submissions WHERE id=NEW.submission_id) IS NOT
     (SELECT assignment_id FROM assignment_questions WHERE id=NEW.assignment_question_id)
BEGIN SELECT RAISE(ABORT, 'submission answer assignment mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_submission_answers_same_assignment_update
BEFORE UPDATE OF submission_id, assignment_question_id ON submission_answers
WHEN (SELECT assignment_id FROM submissions WHERE id=NEW.submission_id) IS NOT
     (SELECT assignment_id FROM assignment_questions WHERE id=NEW.assignment_question_id)
BEGIN SELECT RAISE(ABORT, 'submission answer assignment mismatch'); END;

-- Keep numeric question tolerance sane even if a caller bypasses the API.
CREATE TRIGGER IF NOT EXISTS trg_numeric_question_valid_insert
BEFORE INSERT ON questions
WHEN NEW.type='numeric' AND (NEW.numeric_tolerance IS NULL OR NEW.numeric_tolerance < 0)
BEGIN SELECT RAISE(ABORT, 'invalid numeric tolerance'); END;

CREATE TRIGGER IF NOT EXISTS trg_numeric_question_valid_update
BEFORE UPDATE OF type, numeric_tolerance ON questions
WHEN NEW.type='numeric' AND (NEW.numeric_tolerance IS NULL OR NEW.numeric_tolerance < 0)
BEGIN SELECT RAISE(ABORT, 'invalid numeric tolerance'); END;
