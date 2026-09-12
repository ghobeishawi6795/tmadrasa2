// GET    /api/teacher/question-skills?question_id=123 -> list skills linked to a question
// POST   /api/teacher/question-skills { question_id, skill_id, weight? } -> link (or update weight)
// DELETE /api/teacher/question-skills { question_id, skill_id } -> unlink
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";

async function loadOwnQuestion(db, questionId, teacherId, schoolId) {
    const question = await db.first(
        `SELECT id FROM questions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, questionId, schoolId
    );
    if (!question) throw errors.notFound("سؤال پیدا نشد");
    const owned = await db.first(`SELECT 1 FROM questions WHERE id = ? AND teacher_id = ?`, questionId, teacherId);
    if (!owned) throw errors.forbidden("این سؤال متعلق به شما نیست");
    return question;
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const url = new URL(request.url);
    const questionId = url.searchParams.get("question_id");
    if (!questionId) throw errors.validation("question_id الزامی است");

    const db = q(env);
    await loadOwnQuestion(db, questionId, teacher.id, user.school_id);

    const rows = await db.all(
        `SELECT s.id, s.name, qs.weight FROM question_skills qs
           JOIN learning_skills s ON s.id = qs.skill_id
          WHERE qs.question_id = ? AND s.is_active = 1`,
        questionId
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["question_id", "skill_id"]);
    const weight = body.weight == null ? 1 : Number(body.weight);
    if (!Number.isFinite(weight) || weight <= 0) throw errors.validation("weight نامعتبر است");

    const db = q(env);
    await loadOwnQuestion(db, body.question_id, teacher.id, user.school_id);
    const skill = await db.first(
        `SELECT id FROM learning_skills WHERE id = ? AND teacher_id = ? AND is_active = 1`, body.skill_id, teacher.id
    );
    if (!skill) throw errors.notFound("مهارت پیدا نشد");

    await db.run(
        `INSERT INTO question_skills (question_id, skill_id, weight) VALUES (?, ?, ?)
         ON CONFLICT(question_id, skill_id) DO UPDATE SET weight = excluded.weight`,
        body.question_id, body.skill_id, weight
    );
    return ok(null, "مهارت به سؤال وصل شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["question_id", "skill_id"]);

    const db = q(env);
    await loadOwnQuestion(db, body.question_id, teacher.id, user.school_id);
    await db.run(`DELETE FROM question_skills WHERE question_id = ? AND skill_id = ?`, body.question_id, body.skill_id);
    return ok(null, "مهارت جدا شد");
});
