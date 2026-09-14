// POST /api/auth/register-superadmin
// Public endpoint used ONCE (or a few times, for extra platform owners) to
// create a super-admin account. A super-admin isn't attached to any real
// school, so it's created under the reserved system school (id 0, added in
// migration 015). Same "public bootstrap endpoint" pattern as
// register-school.js -- delete public/register-superadmin.html after use,
// same as that page.
import { q } from "../_shared/db.js";
import { hashPassword } from "../_shared/crypto.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

const SYSTEM_SCHOOL_ID = 0;

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const body = await readJson(request);
    requireFields(body, ["full_name", "username", "password"]);

    if (typeof body.password !== "string" || body.password.length < 8) throw errors.validation("رمز عبور باید حداقل ۸ کاراکتر باشد");

    const db = q(env);

    const role = await db.first(`SELECT id FROM roles WHERE key = 'super_admin'`);
    if (!role) throw errors.server("نقش سوپرادمین در پایگاه‌داده تعریف نشده — مایگریشن ۰۱۵ اجرا نشده است");

    // BUGFIX: this endpoint has no auth gate at all (by design -- it's the
    // very first bootstrap step, before any account exists to authenticate
    // as), and previously only checked username uniqueness -- meaning it
    // stayed open to creating unlimited super_admin accounts forever,
    // including after the user deletes register-superadmin.html, since the
    // API route itself is still deployed and reachable directly. Now locked
    // shut the moment ANY super_admin already exists.
    const existingSuperAdmin = await db.first(
        `SELECT 1 FROM user_roles WHERE role_id = ? LIMIT 1`, role.id
    );
    if (existingSuperAdmin) {
        throw errors.forbidden("یک حساب سوپرادمین از قبل ساخته شده — این مسیر دیگر باز نیست");
    }

    const existing = await db.first(
        `SELECT id FROM users WHERE school_id = ? AND username = ?`,
        SYSTEM_SCHOOL_ID, body.username
    );
    if (existing) throw errors.conflict("این نام کاربری قبلاً ثبت شده است");

    const passwordHash = await hashPassword(body.password);

    const userResult = await db.run(
        `INSERT INTO users (school_id, username, password_hash, full_name, phone, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        SYSTEM_SCHOOL_ID, body.username, passwordHash, body.full_name,
        body.phone || null, body.email || null
    );
    const userId = userResult.meta.last_row_id;

    try {
        await db.run(
            `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
            userId, role.id, SYSTEM_SCHOOL_ID
        );
    } catch (e) {
        await db.run(`DELETE FROM users WHERE id = ?`, userId).catch(() => {});
        if (/super_admin already exists|UNIQUE|constraint/i.test(String(e?.message || e))) throw errors.forbidden("یک حساب سوپرادمین از قبل ساخته شده است");
        throw e;
    }

    await writeAudit(env, {
        schoolId: SYSTEM_SCHOOL_ID, actorUserId: userId, action: "superadmin.register",
        entityType: "user", entityId: userId,
        meta: { username: body.username }, request,
    });

    return ok({ user_id: userId }, "حساب سوپرادمین ساخته شد");
});
