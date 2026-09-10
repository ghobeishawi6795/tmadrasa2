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

    if (body.password.length < 8) {
        throw errors.validation("رمز عبور باید حداقل ۸ کاراکتر باشد");
    }

    const db = q(env);

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

    const role = await db.first(`SELECT id FROM roles WHERE key = 'super_admin'`);
    if (!role) throw errors.server("نقش سوپرادمین در پایگاه‌داده تعریف نشده — مایگریشن ۰۱۵ اجرا نشده است");

    await db.run(
        `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
        userId, role.id, SYSTEM_SCHOOL_ID
    );

    await writeAudit(env, {
        schoolId: SYSTEM_SCHOOL_ID, actorUserId: userId, action: "superadmin.register",
        entityType: "user", entityId: userId,
        meta: { username: body.username }, request,
    });

    return ok({ user_id: userId }, "حساب سوپرادمین ساخته شد");
});
