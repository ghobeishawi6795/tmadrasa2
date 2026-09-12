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
    await requirePermission(env, user, "students.view");
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

    const db = q(env);
    const existing = await db.first(
        `SELECT id FROM users WHERE school_id = ? AND username = ?`,
        user.school_id, body.username
    );
    if (existing) throw errors.conflict("این نام کاربری قبلاً استفاده شده — یک نام کاربری دیگر انتخاب کنید");

    const passwordHash = await hashPassword(body.password);
    let newUserId = null;
    let parentId = null;
    try {
        const userResult = await db.run(
            `INSERT INTO users (school_id, username, password_hash, full_name, phone)
             VALUES (?, ?, ?, ?, ?)`,
            user.school_id, body.username, passwordHash, body.full_name, body.phone || null
        );
        newUserId = userResult.meta.last_row_id;

        const parentResult = await db.run(
            `INSERT INTO parents (user_id, school_id) VALUES (?, ?)`,
            newUserId, user.school_id
        );
        parentId = parentResult.meta.last_row_id;

        const parentRole = await db.first(`SELECT id FROM roles WHERE key = 'parent'`);
        await db.run(
            `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
            newUserId, parentRole.id, user.school_id
        );
    } catch (e) {
        // see admin/students.js for why this cleanup exists: these inserts
        // depend on each other's generated ids so D1 can't run them as one
        // atomic transaction, and an orphaned `users` row would otherwise
        // keep the username permanently stuck as "taken".
        if (parentId) await db.run(`DELETE FROM parents WHERE id = ?`, parentId).catch(() => {});
        if (newUserId) {
            await db.run(`DELETE FROM user_roles WHERE user_id = ?`, newUserId).catch(() => {});
            await db.run(`DELETE FROM users WHERE id = ?`, newUserId).catch(() => {});
        }
        throw e;
    }

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "parent.create",
        entityType: "parent", entityId: parentId,
        meta: { username: body.username }, request,
    }).catch(() => {});

    return created({ id: parentId, user_id: newUserId }, "والد ثبت شد");
});
