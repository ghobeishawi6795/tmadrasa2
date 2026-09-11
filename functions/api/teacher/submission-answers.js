// /api/teacher/submission-answers
// GET  ?submission_id= -> per-question answers for one multi-question submission (for grading)
// POST { answer_id, score, feedback } -> grade one sub-answer; finalizes the
//       submission's overall score (and syncs it into `grades`) once every
//       question that needs manual review has one -- same pattern as
//       teacher/grading.js (manual exam-answer review).
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { notifyUsers } from "../_shared/notify.js";
import { writeAudit } from "../_shared/audit.js";
import { syncGradeFromSource } from "../_shared/grades-sync.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const url = new URL(request.url);
    const submissionId = url.searchParams.get("submission_id");
    requireFields({ submission_id: submissionId }, ["submission_id"]);

    const db = q(env);
    const submission = await db.first(
        `SELECT sub.*, a.teacher_id, a.max_score as assignment_max_score, a.prompt_style as assignment_prompt_style
           FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id
          WHERE sub.id = ? AND sub.school_id = ?`,
        submissionId, user.school_id
    );
    if (!submission) throw errors.notFound("پاسخ پیدا نشد");
    if (submission.teacher_id !== teacher.id) throw errors.forbidden("این تکلیف متعلق به شما نیست");

    const rows = await db.all(
        `SELECT sa.id as answer_id, sa.assignment_question_id, sa.answer_data, sa.score, sa.max_score,
                sa.needs_manual_review, sa.feedback,
                aq.order_index, aq.submission_type, aq.prompt_html, aq.prompt_text
           FROM submission_answers sa
           JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
          WHERE sa.submission_id = ?
          ORDER BY aq.order_index ASC`,
        submissionId
    );
    return ok({ submission, answers: rows.results });
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.grade");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["answer_id", "score"]);

    const db = q(env);
    const answer = await db.first(
        `SELECT sa.*, sub.id as submission_id, sub.student_id, sub.assignment_id,
                a.teacher_id, a.subject_id, a.title as assignment_title, a.max_score as assignment_max_score
           FROM submission_answers sa
           JOIN submissions sub ON sub.id = sa.submission_id
           JOIN assignments a ON a.id = sub.assignment_id
          WHERE sa.id = ?`,
        body.answer_id
    );
    if (!answer) throw errors.notFound("پاسخ پیدا نشد");
    if (answer.teacher_id !== teacher.id) throw errors.forbidden("این تکلیف متعلق به شما نیست");

    const score = Number(body.score);
    if (score < 0 || score > answer.max_score) {
        throw errors.validation(`نمره باید بین ۰ تا ${answer.max_score} باشد`);
    }

    await db.run(
        `UPDATE submission_answers SET score = ?, feedback = ?, needs_manual_review = 0, graded_at = datetime('now') WHERE id = ?`,
        score, body.feedback || null, answer.id
    );

    const stillPending = await db.first(
        `SELECT COUNT(*) as c FROM submission_answers WHERE submission_id = ? AND needs_manual_review = 1`,
        answer.submission_id
    );

    if (stillPending.c === 0) {
        const totals = await db.first(
            `SELECT COALESCE(SUM(score),0) as total, COALESCE(SUM(max_score),0) as total_max
               FROM submission_answers WHERE submission_id = ?`,
            answer.submission_id
        );
        const finalScore = totals.total_max > 0
            ? Math.round((totals.total / totals.total_max) * answer.assignment_max_score * 100) / 100
            : 0;

        await db.run(
            `UPDATE submissions SET score = ?, status = 'graded', needs_manual_review = 0, graded_at = datetime('now') WHERE id = ?`,
            finalScore, answer.submission_id
        );

        await syncGradeFromSource(env, {
            schoolId: user.school_id, studentId: answer.student_id, subjectId: answer.subject_id,
            teacherId: teacher.id, source: "assignment", sourceId: answer.assignment_id,
            score: finalScore, maxScore: answer.assignment_max_score,
        });

        const student = await db.first(`SELECT user_id FROM students WHERE id = ?`, answer.student_id);
        const parents = await db.all(
            `SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id = ? AND ps.school_id = ?`,
            answer.student_id, user.school_id
        );
        await notifyUsers(env, user.school_id, [student.user_id, ...parents.results.map(r => r.user_id)],
            "assignment.graded", "تکلیف تصحیح شد", answer.assignment_title);
    }

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "submission_answer.grade",
        entityType: "submission_answer", entityId: answer.id,
        meta: { score, submission_id: answer.submission_id }, request,
    });

    return ok(null, "نمره ثبت شد");
});
