// /api/teacher/grading -- manual review of short_answer / long_answer exam answers
// GET  ?exam_id=123           -> attempts+answers pending manual review for teacher's exam
// POST { answer_id, score, feedback } -> record manual grade, and finalize attempt if it was the last pending one
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, loadExamOwnedByTeacher } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";
import { syncGradeFromSource } from "../_shared/grades-sync.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.grade");
    const teacher = await getTeacherRecord(env, user.id);

    const url = new URL(request.url);
    const examId = url.searchParams.get("exam_id");
    if (!examId) throw errors.validation("exam_id الزامی است");
    await loadExamOwnedByTeacher(env, examId, teacher.id, user.school_id);

    const db = q(env);
    const rows = await db.all(
        `SELECT ea.id as answer_id, ea.attempt_id, ea.text_answer, q.text as question_text,
                q.correct_text as reference_text, a.student_id
           FROM exam_answers ea
           JOIN exam_attempts a ON a.id = ea.attempt_id
           JOIN questions q ON q.id = ea.question_id
          WHERE a.exam_id = ? AND ea.needs_manual_review = 1 AND ea.score IS NULL`,
        examId
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.grade");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["answer_id", "score"]);

    const db = q(env);
    const answer = await db.first(
        `SELECT ea.*, a.exam_id, a.id as attempt_id, a.student_id, a.max_score as attempt_max_score
           FROM exam_answers ea
          JOIN exam_attempts a ON a.id = ea.attempt_id WHERE ea.id = ?`,
        body.answer_id
    );
    if (!answer) throw errors.notFound("پاسخ پیدا نشد");

    const exam = await loadExamOwnedByTeacher(env, answer.exam_id, teacher.id, user.school_id);

    // max score for this question inside this exam — score can never exceed it
    const eq = await db.first(
        `SELECT score FROM exam_questions WHERE exam_id = ? AND question_id = ?`,
        exam.id, answer.question_id
    );
    if (body.score < 0 || body.score > eq.score) {
        throw errors.validation(`نمره باید بین ۰ و ${eq.score} باشد`);
    }

    await db.run(
        `UPDATE exam_answers SET score = ?, feedback = ?, needs_manual_review = 0, is_correct = ? WHERE id = ?`,
        body.score, body.feedback || null, body.score > 0 ? 1 : 0, answer.id
    );

    // recompute the attempt total if nothing else is pending
    const stillPending = await db.first(
        `SELECT COUNT(*) as c FROM exam_answers WHERE attempt_id = ? AND needs_manual_review = 1`,
        answer.attempt_id
    );
    if (stillPending.c === 0) {
        const totalRow = await db.first(
            `SELECT COALESCE(SUM(score),0) as total FROM exam_answers WHERE attempt_id = ?`,
            answer.attempt_id
        );
        await db.run(
            `UPDATE exam_attempts SET status='graded', manual_score = ?, total_score = ? WHERE id = ?`,
            totalRow.total, totalRow.total, answer.attempt_id
        );

        // BUGFIX: same gap as the auto-graded path in student/exam-attempt.js --
        // finishing manual grading used to never sync into `grades`.
        await syncGradeFromSource(env, {
            schoolId: user.school_id, studentId: answer.student_id, subjectId: exam.subject_id,
            teacherId: teacher.id, source: "exam", sourceId: exam.id,
            score: totalRow.total, maxScore: answer.attempt_max_score,
        });
    }

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "answer.grade_manual",
        entityType: "exam_answer", entityId: answer.id,
        meta: { score: body.score, exam_id: exam.id }, request,
    });

    return ok(null, "نمره تصحیح دستی ثبت شد");
});
