// /api/teacher/exam-questions -- attach/detach/reorder questions on a DRAFT exam
// POST   -> attach a question { exam_id, question_id, position, score }
// PUT    -> reorder/rescope { exam_id, items: [{question_id, position, score}] }
// DELETE -> detach { exam_id, question_id }
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, loadExamOwnedByTeacher, loadQuestionOwnedByTeacher } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["exam_id", "question_id"]);

    const exam = await loadExamOwnedByTeacher(env, body.exam_id, teacher.id, user.school_id);
    if (exam.status !== "draft") throw errors.forbidden("فقط آزمون پیش‌نویس قابل ویرایش سؤال است");
    await loadQuestionOwnedByTeacher(env, body.question_id, teacher.id, user.school_id);

    const db = q(env);
    await db.run(
        `INSERT INTO exam_questions (exam_id, question_id, position, score) VALUES (?, ?, ?, ?)`,
        exam.id, body.question_id, body.position ?? 0, body.score ?? 1
    );
    return ok(null, "سؤال به آزمون اضافه شد");
});

export const onRequestPut = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["exam_id", "items"]);
    const exam = await loadExamOwnedByTeacher(env, body.exam_id, teacher.id, user.school_id);
    if (exam.status !== "draft") throw errors.forbidden("فقط آزمون پیش‌نویس قابل ویرایش سؤال است");

    const db = q(env);
    // backend re-validates ordering/scores; never trusts client-only ordering blindly beyond this write
    const statements = body.items.map(it => ({
        sql: `UPDATE exam_questions SET position = ?, score = ? WHERE exam_id = ? AND question_id = ?`,
        params: [it.position, it.score, exam.id, it.question_id],
    }));
    await db.batch(statements);
    return ok(null, "ترتیب سؤالات به‌روزرسانی شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["exam_id", "question_id"]);
    const exam = await loadExamOwnedByTeacher(env, body.exam_id, teacher.id, user.school_id);
    if (exam.status !== "draft") throw errors.forbidden("فقط آزمون پیش‌نویس قابل ویرایش سؤال است");

    const db = q(env);
    await db.run(`DELETE FROM exam_questions WHERE exam_id = ? AND question_id = ?`, exam.id, body.question_id);
    return ok(null, "سؤال از آزمون حذف شد");
});
