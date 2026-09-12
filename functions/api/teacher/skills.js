// GET    /api/teacher/skills             -> list the teacher's own skills
// POST   /api/teacher/skills { name, description? } -> create
// DELETE /api/teacher/skills { id }       -> soft-disable (is_active = 0),
//         never a hard delete -- a skill already linked to questions
//         should keep those links meaningful in analytics/history.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const db = q(env);
    const skills = await db.all(
        `SELECT * FROM learning_skills WHERE teacher_id = ? AND school_id = ? AND is_active = 1 ORDER BY name ASC`,
        teacher.id, user.school_id
    );
    return ok(skills.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["name"]);
    requireMaxLength(body.name, 100, "نام مهارت");
    requireMaxLength(body.description, 500, "توضیح مهارت");

    const db = q(env);
    const result = await db.run(
        `INSERT INTO learning_skills (school_id, teacher_id, name, description) VALUES (?, ?, ?, ?)`,
        user.school_id, teacher.id, body.name, body.description || null
    );
    return created({ id: result.meta.last_row_id }, "مهارت ساخته شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const skill = await db.first(`SELECT id, teacher_id FROM learning_skills WHERE id = ?`, body.id);
    if (!skill) throw errors.notFound("مهارت پیدا نشد");
    if (skill.teacher_id !== teacher.id) throw errors.forbidden("این مهارت متعلق به شما نیست");

    await db.run(`UPDATE learning_skills SET is_active = 0 WHERE id = ?`, skill.id);
    return ok(null, "مهارت حذف شد");
});
