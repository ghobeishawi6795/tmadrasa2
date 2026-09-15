// /api/admin/parents -- create/list parent accounts (linking to children is a separate endpoint)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { hashPassword } from "../_shared/crypto.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    // reuses the admin-level "manage people" permission set; parents have no
    // dedicated permission key, so this endpoint is gated the same way
    // teachers/students management is: implicitly admin-only in practice via
    // the front-end, but explicitly here via students.view (broadest "view
    // people" permission this school issues teachers/admins).
    await requirePermission(env, user, "parents.view");
    const db = q(env);
    const rows = await db.all(
        `SELECT p.id, u.id as user_id, u.full_name, u.username, u.is_active
           FROM parents p JOIN users u ON u.id = p.user_id
          WHERE p.school_id = ? AND p.deleted_at IS NULL
          ORDER BY u.full_name`,
        user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.create");
    const body = await readJson(request);
    requireFields(body, ["full_name", "username", "password"]);
    if (typeof body.password !== "string" || body.password.length < 8) throw errors.validation("رمز عبور باید حداقل ۸ کاراکتر باشد");

    const db = q(env);
    const existing = await db.first(
        `SELECT id FROM users WHERE school_id = ? AND username = ?`,
        user.school_id, body.username
    );
    if (existing) throw errors.conflict("این نام کاربری قبلاً استفاده شده — یک نام کاربری دیگر انتخاب کنید");

    const passwordHash = await hashPassword(body.password);
    const parentRole = await db.first(`SELECT id FROM roles WHERE key = 'parent'`);

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
            sql: `INSERT INTO parents (user_id, school_id)
                  VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?)`,
            params: [user.school_id, body.username, user.school_id],
        },
        {
            sql: `INSERT INTO user_roles (user_id, role_id, school_id)
                  VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
            params: [user.school_id, body.username, parentRole.id, user.school_id],
        },
    ]);

    const created_ = await db.first(
        `SELECT u.id as user_id, p.id as parent_id FROM users u JOIN parents p ON p.user_id = u.id
          WHERE u.school_id = ? AND u.username = ?`,
        user.school_id, body.username
    );
    const newUserId = created_.user_id;
    const parentId = created_.parent_id;

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "parent.create",
        entityType: "parent", entityId: parentId,
        meta: { username: body.username }, request,
    }).catch(() => {});

    return created({ id: parentId, user_id: newUserId }, "والد ثبت شد");
});
