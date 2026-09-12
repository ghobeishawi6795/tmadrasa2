// /api/admin/teachers -- create/list teacher accounts
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { hashPassword } from "../_shared/crypto.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "teachers.view");
    const db = q(env);
    const rows = await db.all(
        `SELECT t.id, u.id as user_id, t.specialty, u.full_name, u.username, u.is_active
           FROM teachers t JOIN users u ON u.id = t.user_id
          WHERE t.school_id = ? AND t.deleted_at IS NULL
          ORDER BY u.full_name`,
        user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "teachers.create");
    const body = await readJson(request);
    requireFields(body, ["full_name", "username", "password"]);

    const db = q(env);
    const existing = await db.first(
        `SELECT id FROM users WHERE school_id = ? AND username = ?`,
        user.school_id, body.username
    );
    if (existing) throw errors.conflict("این نام کاربری قبلاً استفاده شده — یک نام کاربری دیگر انتخاب کنید");

    const passwordHash = await hashPassword(body.password);
    let newUserId = null;
    let teacherId = null;
    try {
        const userResult = await db.run(
            `INSERT INTO users (school_id, username, password_hash, full_name, phone)
             VALUES (?, ?, ?, ?, ?)`,
            user.school_id, body.username, passwordHash, body.full_name, body.phone || null
        );
        newUserId = userResult.meta.last_row_id;

        const teacherResult = await db.run(
            `INSERT INTO teachers (user_id, school_id, specialty) VALUES (?, ?, ?)`,
            newUserId, user.school_id, body.specialty || null
        );
        teacherId = teacherResult.meta.last_row_id;

        const teacherRole = await db.first(`SELECT id FROM roles WHERE key = 'teacher'`);
        await db.run(
            `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
            newUserId, teacherRole.id, user.school_id
        );
    } catch (e) {
        // see admin/students.js for why this cleanup exists: these inserts
        // depend on each other's generated ids so D1 can't run them as one
        // atomic transaction, and an orphaned `users` row would otherwise
        // keep the username permanently stuck as "taken".
        if (teacherId) await db.run(`DELETE FROM teachers WHERE id = ?`, teacherId).catch(() => {});
        if (newUserId) {
            await db.run(`DELETE FROM user_roles WHERE user_id = ?`, newUserId).catch(() => {});
            await db.run(`DELETE FROM users WHERE id = ?`, newUserId).catch(() => {});
        }
        throw e;
    }

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "teacher.create",
        entityType: "teacher", entityId: teacherId,
        meta: { username: body.username }, request,
    }).catch(() => {});

    return created({ id: teacherId, user_id: newUserId }, "معلم ثبت شد");
});
