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
    const teacherRole = await db.first(`SELECT id FROM roles WHERE key = 'teacher'`);

    // BUGFIX: see admin/students.js for the full rationale -- switched from
    // 3 dependent INSERTs + manual cleanup-on-error to one real db.batch()
    // transaction, with each dependent id resolved via a subquery on the
    // just-checked-unique `username` instead of a JS-bound generated id.
    await db.batch([
        {
            sql: `INSERT INTO users (school_id, username, password_hash, full_name, phone)
                  VALUES (?, ?, ?, ?, ?)`,
            params: [user.school_id, body.username, passwordHash, body.full_name, body.phone || null],
        },
        {
            sql: `INSERT INTO teachers (user_id, school_id, specialty)
                  VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
            params: [user.school_id, body.username, user.school_id, body.specialty || null],
        },
        {
            sql: `INSERT INTO user_roles (user_id, role_id, school_id)
                  VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
            params: [user.school_id, body.username, teacherRole.id, user.school_id],
        },
    ]);

    const created_ = await db.first(
        `SELECT u.id as user_id, t.id as teacher_id FROM users u JOIN teachers t ON t.user_id = u.id
          WHERE u.school_id = ? AND u.username = ?`,
        user.school_id, body.username
    );
    const newUserId = created_.user_id;
    const teacherId = created_.teacher_id;

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "teacher.create",
        entityType: "teacher", entityId: teacherId,
        meta: { username: body.username }, request,
    }).catch(() => {});

    return created({ id: teacherId, user_id: newUserId }, "معلم ثبت شد");
});
