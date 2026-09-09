// /api/admin/parent-students -- link/unlink a parent to a child (student)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.view");
    const db = q(env);
    const rows = await db.all(
        `SELECT ps.parent_id, ps.student_id, up.full_name as parent_name, us.full_name as student_name
           FROM parent_students ps
           JOIN parents p ON p.id = ps.parent_id JOIN users up ON up.id = p.user_id
           JOIN students s ON s.id = ps.student_id JOIN users us ON us.id = s.user_id
          WHERE ps.school_id = ?
          ORDER BY up.full_name`,
        user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.create");
    const body = await readJson(request);
    requireFields(body, ["parent_id", "student_id"]);

    const db = q(env);

    const parent = await db.first(
        `SELECT * FROM parents WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.parent_id, user.school_id
    );
    if (!parent) throw errors.notFound("والد پیدا نشد");

    const student = await db.first(
        `SELECT * FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.student_id, user.school_id
    );
    if (!student) throw errors.notFound("دانش‌آموز پیدا نشد");

    await db.run(
        `INSERT OR IGNORE INTO parent_students (parent_id, student_id, school_id) VALUES (?, ?, ?)`,
        parent.id, student.id, user.school_id
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "parent_student.link",
        entityType: "parent_students", meta: { parent_id: parent.id, student_id: student.id }, request,
    });

    return created(null, "والد به دانش‌آموز متصل شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.delete");
    const body = await readJson(request);
    requireFields(body, ["parent_id", "student_id"]);

    const db = q(env);
    await db.run(
        `DELETE FROM parent_students WHERE parent_id = ? AND student_id = ? AND school_id = ?`,
        body.parent_id, body.student_id, user.school_id
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "parent_student.unlink",
        entityType: "parent_students", meta: { parent_id: body.parent_id, student_id: body.student_id }, request,
    });

    return ok(null, "اتصال حذف شد");
});
