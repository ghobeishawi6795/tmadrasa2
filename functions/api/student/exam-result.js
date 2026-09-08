// GET /api/student/exam-result?attempt_id=123
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const student = await getStudentRecord(env, user.id);
    const db = q(env);

    const url = new URL(request.url);
    const attemptId = url.searchParams.get("attempt_id");
    if (!attemptId) throw errors.validation("attempt_id الزامی است");

    const attempt = await db.first(`SELECT * FROM exam_attempts WHERE id = ?`, attemptId);
    if (!attempt) throw errors.notFound("Attempt پیدا نشد");
    if (attempt.student_id !== student.id) throw errors.forbidden("این نتیجه متعلق به شما نیست");

    const answers = await db.all(
        `SELECT is_correct, score, needs_manual_review FROM exam_answers WHERE attempt_id = ?`,
        attempt.id
    );

    const correctCount = answers.results.filter(a => a.is_correct === 1).length;
    const incorrectCount = answers.results.filter(a => a.is_correct === 0).length;
    const pendingCount = answers.results.filter(a => a.needs_manual_review === 1).length;

    return ok({
        attempt_id: attempt.id,
        status: attempt.status, // in_progress | submitted (pending manual) | graded
        total_score: attempt.total_score,
        max_score: attempt.max_score,
        correct_count: correctCount,
        incorrect_count: incorrectCount,
        pending_manual_review: pendingCount,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
    });
});
