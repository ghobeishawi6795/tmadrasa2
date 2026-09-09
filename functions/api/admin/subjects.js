// /api/admin/subjects -- list/create/delete subjects
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "subjects.view");
    const db = q(env);
    const rows = await db.all(
        `SELECT id, name, grade FROM subjects WHERE school_id = ? AND deleted_at IS NULL ORDER BY name`,
        user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "subjects.create");
    const body = await readJson(request);
    requireFields(body, ["name"]);

    const db = q(env);
    const result = await db.run(
        `INSERT INTO subjects (school_id, name, grade) VALUES (?, ?, ?)`,
        user.school_id, body.name, body.grade || null
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "subject.create",
        entityType: "subject", entityId: result.meta.last_row_id,
        meta: { name: body.name }, request,
    });

    return created({ id: result.meta.last_row_id }, "درس ساخته شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "subjects.delete");
    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const subject = await db.first(
        `SELECT * FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.id, user.school_id
    );
    if (!subject) throw errors.notFound("درس پیدا نشد");

    await db.run(`UPDATE subjects SET deleted_at = datetime('now') WHERE id = ?`, subject.id);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "subject.delete",
        entityType: "subject", entityId: subject.id, request,
    });

    return ok(null, "درس حذف شد");
});
