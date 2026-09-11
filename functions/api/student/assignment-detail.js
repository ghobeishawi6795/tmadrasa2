// GET /api/student/assignment-detail?id=123
// Full detail for ONE multi-question assignment: the ordered list of its
// sub-questions (answer keys stripped for match/drag_drop, same as the
// single-question flow in student/assignments.js) plus the student's own
// latest submission and per-question answers, if any.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord, loadAssignmentForStudent } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";
import { sanitizeForStudent } from "../_shared/interactive.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.view");
    const student = await getStudentRecord(env, user.id);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) throw errors.validation("id الزامی است");

    const assignment = await loadAssignmentForStudent(env, id, student.id, user.school_id);
    if (!assignment.is_multi_question) throw errors.validation("این تکلیف چندسؤالی نیست");

    const db = q(env);
    const questions = await db.all(
        `SELECT id, order_index, submission_type, question_payload, prompt_html, prompt_text, weight
           FROM assignment_questions WHERE assignment_id = ? ORDER BY order_index ASC`,
        assignment.id
    );

    const submission = await db.first(
        `SELECT id, attempt_number, status, score, feedback, submitted_at, graded_at, needs_manual_review
           FROM submissions WHERE assignment_id = ? AND student_id = ?
          ORDER BY attempt_number DESC LIMIT 1`,
        assignment.id, student.id
    );

    let answersByQuestion = {};
    if (submission) {
        const answers = await db.all(
            `SELECT assignment_question_id, answer_data, score, max_score, needs_manual_review, feedback
               FROM submission_answers WHERE submission_id = ?`,
            submission.id
        );
        answersByQuestion = Object.fromEntries(answers.results.map(a => [a.assignment_question_id, a]));
    }

    const sanitizedQuestions = questions.results.map(row => {
        const { question_payload, ...rest } = row;
        const out = { ...rest };
        if (question_payload && (row.submission_type === "match" || row.submission_type === "drag_drop")) {
            out.interactive = sanitizeForStudent(row);
        }
        out.my_answer = answersByQuestion[row.id] || null;
        return out;
    });

    const { question_payload, submission_type, ...assignmentRest } = assignment;
    return ok({ ...assignmentRest, questions: sanitizedQuestions, submission: submission || null });
});
