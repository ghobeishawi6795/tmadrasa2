// POST /api/auth/register-school
// Public endpoint used ONCE to create a brand-new school + its first admin user.
// Not self-locking globally (each school is independent), but a school name is not
// enough to bootstrap into an existing school — this always creates a NEW school_id.
import { q } from "../_shared/db.js";
import { hashPassword } from "../_shared/crypto.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const body = await readJson(request);
    requireFields(body, ["school_name", "admin_full_name", "username", "password"]);

    if (typeof body.password !== "string" || body.password.length < 8) throw errors.validation("رمز عبور باید حداقل ۸ کاراکتر باشد");
    if (typeof body.school_name !== "string" || body.school_name.trim().length < 2 || body.school_name.length > 200) throw errors.validation("نام مدرسه نامعتبر است");
    if (typeof body.username !== "string" || body.username.length < 3 || body.username.length > 100) throw errors.validation("نام کاربری نامعتبر است");

    const db = q(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    await db.run(`DELETE FROM registration_attempts WHERE created_at < datetime('now', '-1 day')`);
    const recentRegistrations = await db.first(
        `SELECT COUNT(*) AS c FROM registration_attempts WHERE ip_address = ? AND created_at > datetime('now', '-15 minutes')`, ip
    );
    if (recentRegistrations.c >= 5) throw errors.forbidden("تعداد ثبت‌نام‌های اخیر از این نشانی بیش از حد مجاز است؛ بعداً دوباره تلاش کنید");
    await db.run(`INSERT INTO registration_attempts (ip_address) VALUES (?)`, ip);

    let schoolId = null;
    let userId = null;
    try {
        const schoolResult = await db.run(
            `INSERT INTO schools (name, phone, address) VALUES (?, ?, ?)`,
            body.school_name.trim(), body.school_phone || null, body.school_address || null
        );
        schoolId = schoolResult.meta.last_row_id;

        const passwordHash = await hashPassword(body.password);
        const userResult = await db.run(
            `INSERT INTO users (school_id, username, password_hash, full_name, phone, email)
             VALUES (?, ?, ?, ?, ?, ?)`,
            schoolId, body.username, passwordHash, body.admin_full_name,
            body.phone || null, body.email || null
        );
        userId = userResult.meta.last_row_id;

        const adminRole = await db.first(`SELECT id FROM roles WHERE key = 'admin'`);
        if (!adminRole) throw errors.server("نقش مدیر در پایگاه‌داده وجود ندارد");
        await db.run(
            `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
            userId, adminRole.id, schoolId
        );
    } catch (e) {
        if (userId) {
            await db.run(`DELETE FROM user_roles WHERE user_id = ?`, userId).catch(() => {});
            await db.run(`DELETE FROM users WHERE id = ?`, userId).catch(() => {});
        }
        if (schoolId) await db.run(`DELETE FROM schools WHERE id = ?`, schoolId).catch(() => {});
        throw e;
    }

    await writeAudit(env, {
        schoolId, actorUserId: userId, action: "school.register",
        entityType: "school", entityId: schoolId,
        meta: { admin_username: body.username }, request,
    });

    return ok({ school_id: schoolId, user_id: userId }, "مدرسه و حساب مدیر با موفقیت ساخته شد");
});
