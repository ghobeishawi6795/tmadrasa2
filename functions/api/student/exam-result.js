// GET /api/student/exam-result?attempt_id=123
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";
import { getQuestionVersion } from "../_shared/question-versions.js";

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

    // per-question review -- only once the attempt is no longer in_progress,
    // i.e. everything auto-gradable has actually been graded. Never reveal
    // the correct answer for a question the student hasn't submitted yet.
    let questions = undefined;
    if (attempt.status !== "in_progress") {
        const rows = await db.all(
            `SELECT ea.*, eq.pinned_version, eq.position,
                    q.type, q.text as live_text, q.explanation,
                    q.correct_boolean, q.correct_numeric, q.numeric_tolerance, q.correct_text, q.correct_option_id
               FROM exam_answers ea
               JOIN exam_questions eq ON eq.exam_id = ? AND eq.question_id = ea.question_id
               JOIN questions q ON q.id = ea.question_id
              WHERE ea.attempt_id = ?
              ORDER BY eq.position ASC`,
            attempt.exam_id, attempt.id
        );

        questions = [];
        for (const row of rows.results) {
            const snapshot = await getQuestionVersion(env, row.question_id, row.pinned_version);

            let text, options, correctBoolean, correctNumeric, numericTolerance, correctText;
            if (snapshot) {
                text = snapshot.text;
                options = snapshot.options ? snapshot.options.map(o => ({ id: o.local_id, text: o.text, is_correct: o.is_correct })) : undefined;
                correctBoolean = snapshot.correct_boolean;
                correctNumeric = snapshot.correct_numeric;
                numericTolerance = snapshot.numeric_tolerance;
                correctText = snapshot.correct_text;
            } else {
                // legacy fallback: attachment predates versioning
                text = row.live_text;
                correctBoolean = row.correct_boolean;
                correctNumeric = row.correct_numeric;
                numericTolerance = row.numeric_tolerance;
                correctText = row.correct_text;
                if (row.type === "multiple_choice") {
                    const opts = await db.all(`SELECT * FROM question_options WHERE question_id = ?`, row.question_id);
                    options = opts.results.map(o => ({ id: o.id, text: o.text, is_correct: !!o.is_correct }));
                }
            }

            questions.push({
                question_id: row.question_id,
                type: row.type,
                text,
                options,
                student_answer: {
                    selected_option_id: row.selected_option_id,
                    boolean_answer: row.boolean_answer,
                    numeric_answer: row.numeric_answer,
                    text_answer: row.text_answer,
                },
                correct_boolean: row.type === "true_false" ? correctBoolean : undefined,
                correct_numeric: row.type === "numeric" ? correctNumeric : undefined,
                numeric_tolerance: row.type === "numeric" ? numericTolerance : undefined,
                correct_text: (row.type === "short_answer" || row.type === "long_answer" || row.type === "fill_blank") ? correctText : undefined,
                is_correct: row.is_correct,
                score: row.score,
                needs_manual_review: !!row.needs_manual_review,
                // deliberately the LIVE explanation, not the pinned snapshot --
                // unlike the answer key, this doesn't affect grading, so a
                // teacher's later-improved wording should reach students who
                // already took the exam too.
                explanation: row.explanation || null,
            });
        }
    }

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
        questions,
    });
});
