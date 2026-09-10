// /api/superadmin/schools
// GET    -> list every real school (id != 0, the reserved system school)
//           with per-school counts (students/teachers/parents/admins) and
//           last activity timestamp -- powers the super-admin overview.
// POST   { name, phone?, address? } -> create a new (empty) school.
// PATCH  { id, active } -> activate/deactivate a school. A deactivated
//           school's users can no longer log in (enforced in auth/login.js).
import { q } from "../_shared/db.js";
import { authenticate, requireRole } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const db = q(env);

    const rows = await db.all(
        `SELECT
            s.id, s.name, s.phone, s.address, s.active, s.created_at,
            (SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id
                                           JOIN roles r ON r.id = ur.role_id
              WHERE u.school_id = s.id AND u.deleted_at IS NULL AND r.key = 'admin')   as admin_count,
            (SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id
                                           JOIN roles r ON r.id = ur.role_id
              WHERE u.school_id = s.id AND u.deleted_at IS NULL AND r.key = 'teacher') as teacher_count,
            (SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id
                                           JOIN roles r ON r.id = ur.role_id
              WHERE u.school_id = s.id AND u.deleted_at IS NULL AND r.key = 'student') as student_count,
            (SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id
                                           JOIN roles r ON r.id = ur.role_id
              WHERE u.school_id = s.id AND u.deleted_at IS NULL AND r.key = 'parent')  as parent_count,
            (SELECT MAX(la.created_at) FROM login_attempts la
              WHERE la.school_id = s.id AND la.success = 1) as last_login_at
         FROM schools s
        WHERE s.id != 0
        ORDER BY s.created_at DESC`
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const body = await readJson(request);
    requireFields(body, ["name"]);
    requireMaxLength(body.name, 200, "نام مدرسه");

    const db = q(env);
    const result = await db.run(
        `INSERT INTO schools (name, phone, address) VALUES (?, ?, ?)`,
        body.name, body.phone || null, body.address || null
    );
    const schoolId = result.meta.last_row_id;

    await writeAudit(env, {
        schoolId, actorUserId: user.id, action: "superadmin.school_create",
        entityType: "school", entityId: schoolId, meta: { name: body.name }, request,
    });

    return created({ id: schoolId }, "مدرسه ساخته شد");
});

export const onRequestPatch = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const body = await readJson(request);
    requireFields(body, ["id"]);
    if (body.id === 0) throw errors.validation("این مدرسه سیستمی است و قابل تغییر نیست");
    if (typeof body.active !== "boolean" && body.active !== 0 && body.active !== 1) {
        throw errors.validation("مقدار active باید true/false باشد");
    }

    const db = q(env);
    const school = await db.first(`SELECT id FROM schools WHERE id = ?`, body.id);
    if (!school) throw errors.notFound("مدرسه پیدا نشد");

    const active = body.active ? 1 : 0;
    await db.run(
        `UPDATE schools SET active = ?, updated_at = datetime('now') WHERE id = ?`,
        active, body.id
    );

    await writeAudit(env, {
        schoolId: body.id, actorUserId: user.id,
        action: active ? "superadmin.school_activate" : "superadmin.school_deactivate",
        entityType: "school", entityId: body.id, request,
    });

    return ok(null, active ? "مدرسه فعال شد" : "مدرسه غیرفعال شد");
});
