// /api/student/exam-attempt
// POST { action: "start", exam_id }                                  -> creates exam_attempt
// POST { action: "answer", attempt_id, question_id, ...answer }      -> upserts one answer
// POST { action: "submit", attempt_id }                              -> finalizes + auto-grades
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord, assertStudentInClass } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { syncGradeFromSource } from "../_shared/grades-sync.js";
import { getQuestionVersion } from "../_shared/question-versions.js";
import { normalizeSearchText } from "../_shared/search-normalize.js";

async function loadOwnAttempt(db, attemptId, studentId) {
    const attempt = await db.first(`SELECT * FROM exam_attempts WHERE id = ?`, attemptId);
    if (!attempt) throw errors.notFound("Attempt پیدا نشد");
    if (attempt.student_id !== studentId) throw errors.forbidden("این Attempt متعلق به شما نیست");
    return attempt;
}

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const student = await getStudentRecord(env, user.id);
    const db = q(env);
    const body = await readJson(request);
    requireFields(body, ["action"]);

    if (body.action === "start") {
        await requirePermission(env, user, "exam_attempts.create");
        requireFields(body, ["exam_id"]);

        const exam = await db.first(
            `SELECT * FROM exams WHERE id = ? AND school_id = ? AND status = 'published' AND deleted_at IS NULL`,
            body.exam_id, user.school_id
        );
        if (!exam) throw errors.notFound("آزمون پیدا نشد یا منتشر نشده است");
        await assertStudentInClass(env, student.id, exam.class_id, user.school_id);

        if (new Date() < new Date(exam.start_at) || new Date() > new Date(exam.end_at)) {
            throw errors.forbidden("خارج از بازه زمانی مجاز آزمون هستید");
        }

        const existing = await db.all(
            `SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?`, exam.id, student.id
        );
        const inProgress = existing.results.find(a => a.status === "in_progress");
        if (inProgress) return ok({ attempt_id: inProgress.id }, "ادامه Attempt قبلی");

        if (existing.results.length >= exam.max_attempts) {
            throw errors.forbidden("تعداد دفعات مجاز به پایان رسیده است");
        }

        const maxScoreRow = await db.first(
            `SELECT COALESCE(SUM(score),0) as total FROM exam_questions WHERE exam_id = ?`, exam.id
        );

        const result = await db.run(
            `INSERT INTO exam_attempts (school_id, exam_id, student_id, attempt_number, status, max_score)
             VALUES (?, ?, ?, ?, 'in_progress', ?)`,
            user.school_id, exam.id, student.id, existing.results.length + 1, maxScoreRow.total
        );
        return created({ attempt_id: result.meta.last_row_id }, "Attempt شروع شد");
    }

    if (body.action === "answer") {
        requireFields(body, ["attempt_id", "question_id"]);
        const attempt = await loadOwnAttempt(db, body.attempt_id, student.id);
        if (attempt.status !== "in_progress") throw errors.forbidden("این Attempt دیگر قابل ویرایش نیست");

        // question must belong to this exam — prevents submitting a foreign question_id
        const belongs = await db.first(
            `SELECT 1 FROM exam_questions WHERE exam_id = ? AND question_id = ?`,
            attempt.exam_id, body.question_id
        );
        if (!belongs) throw errors.forbidden("این سؤال متعلق به این آزمون نیست");

        await db.run(
            `INSERT INTO exam_answers (attempt_id, question_id, selected_option_id, boolean_answer, numeric_answer, text_answer)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(attempt_id, question_id) DO UPDATE SET
               selected_option_id = excluded.selected_option_id,
               boolean_answer = excluded.boolean_answer,
               numeric_answer = excluded.numeric_answer,
               text_answer = excluded.text_answer`,
            attempt.id, body.question_id,
            body.selected_option_id ?? null, body.boolean_answer ?? null,
            body.numeric_answer ?? null, body.text_answer ?? null
        );
        return ok(null, "پاسخ ثبت شد");
    }

    if (body.action === "submit") {
        requireFields(body, ["attempt_id"]);
        const attempt = await loadOwnAttempt(db, body.attempt_id, student.id);
        if (attempt.status !== "in_progress") throw errors.forbidden("این Attempt قبلاً ثبت نهایی شده است");

        const exam = await db.first(`SELECT * FROM exams WHERE id = ?`, attempt.exam_id);
        const examQuestions = await db.all(
            `SELECT q.*, eq.score as max_q_score, eq.pinned_version FROM exam_questions eq
              JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = ?`,
            exam.id
        );
        const answers = await db.all(`SELECT * FROM exam_answers WHERE attempt_id = ?`, attempt.id);
        const answerByQ = Object.fromEntries(answers.results.map(a => [a.question_id, a]));

        let autoScore = 0;
        const gradeStatements = [];

        for (const question of examQuestions.results) {
            const answer = answerByQ[question.id];
            if (!answer) continue; // unanswered -> score stays 0/null

            // grade against the pinned snapshot (frozen when this question
            // was attached to this exam) whenever one exists -- never the
            // live `questions` row, which the teacher may have edited since.
            const snapshot = await getQuestionVersion(env, question.id, question.pinned_version);
            const source = snapshot || question; // legacy fallback: pre-versioning attachment

            let isCorrect = null, score = 0, needsManual = 0;

            if (question.type === "multiple_choice") {
                if (snapshot) {
                    const correctOpt = (snapshot.options || []).find(o => o.is_correct);
                    isCorrect = correctOpt && answer.selected_option_id === correctOpt.local_id ? 1 : 0;
                } else {
                    isCorrect = answer.selected_option_id === question.correct_option_id ? 1 : 0;
                }
                score = isCorrect ? question.max_q_score : 0;
            } else if (question.type === "true_false") {
                isCorrect = answer.boolean_answer === source.correct_boolean ? 1 : 0;
                score = isCorrect ? question.max_q_score : 0;
            } else if (question.type === "numeric") {
                const tol = source.numeric_tolerance || 0;
                isCorrect = Math.abs((answer.numeric_answer ?? NaN) - source.correct_numeric) <= tol ? 1 : 0;
                score = isCorrect ? question.max_q_score : 0;
            } else if (question.type === "fill_blank") {
                // grading_mode is the teacher's own per-question choice --
                // "manual" behaves exactly like short_answer/long_answer.
                const mode = source.grading_mode || "auto";
                if (mode === "manual") {
                    needsManual = 1;
                } else {
                    // correct_text holds a comma-separated list of accepted
                    // answers; normalized Persian-text compare (same rules
                    // as bank search), not a strict raw string match.
                    const accepted = (source.correct_text || "").split(",").map(s => normalizeSearchText(s.trim())).filter(Boolean);
                    const given = normalizeSearchText((answer.text_answer || "").trim());
                    isCorrect = given && accepted.includes(given) ? 1 : 0;
                    score = isCorrect ? question.max_q_score : 0;
                }
            } else {
                // short_answer / long_answer -> always manual
                needsManual = 1;
            }

            if (!needsManual) autoScore += score;

            gradeStatements.push({
                sql: `UPDATE exam_answers SET is_correct = ?, score = ?, needs_manual_review = ? WHERE id = ?`,
                params: [isCorrect, needsManual ? null : score, needsManual, answer.id],
            });
        }

        if (gradeStatements.length) await db.batch(gradeStatements);

        const pendingManual = await db.first(
            `SELECT COUNT(*) as c FROM exam_answers WHERE attempt_id = ? AND needs_manual_review = 1`,
            attempt.id
        );
        const newStatus = pendingManual.c > 0 ? "submitted" : "graded";
        const totalScore = pendingManual.c > 0 ? null : autoScore; // final only once nothing is pending

        await db.run(
            `UPDATE exam_attempts SET status = ?, submitted_at = datetime('now'),
                                       auto_score = ?, total_score = ? WHERE id = ?`,
            newStatus, autoScore, totalScore, attempt.id
        );

        // BUGFIX: exam results used to never reach the `grades` table that
        // report cards read from -- only sync once fully graded (totalScore
        // is only final when nothing is left pending manual review).
        if (newStatus === "graded") {
            await syncGradeFromSource(env, {
                schoolId: user.school_id, studentId: student.id, subjectId: exam.subject_id,
                teacherId: exam.teacher_id, source: "exam", sourceId: exam.id,
                score: totalScore, maxScore: attempt.max_score,
            });
        }

        return ok({ pending_manual_review: pendingManual.c > 0 }, "آزمون ثبت نهایی شد");
    }

    throw errors.validation("action نامعتبر است");
});
