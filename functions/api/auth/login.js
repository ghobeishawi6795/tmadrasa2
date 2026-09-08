// POST /api/auth/login  { school_id, username, password }
import { q } from "../_shared/db.js";
import { verifyPassword } from "../_shared/crypto.js";
import { createSession } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const body = await readJson(request);
    requireFields(body, ["school_id", "username", "password"]);

    const db = q(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // opportunistic cleanup of old attempt rows
    await db.run(`DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')`);

    const recentFailures = await db.first(
        `SELECT COUNT(*) as c FROM login_attempts
          WHERE username = ? AND school_id = ? AND success = 0
            AND created_at > datetime('now', '-${WINDOW_MINUTES} minutes')`,
        body.username, body.school_id
    );

    if (recentFailures.c >= MAX_FAILED_ATTEMPTS) {
        throw errors.forbidden("تعداد تلاش‌های ناموفق زیاد بوده؛ چند دقیقه دیگر تلاش کنید");
    }

    const user = await db.first(
        `SELECT * FROM users WHERE school_id = ? AND username = ? AND deleted_at IS NULL`,
        body.school_id, body.username
    );

    const valid = user ? await verifyPassword(body.password, user.password_hash) : false;

    await db.run(
        `INSERT INTO login_attempts (school_id, username, ip_address, success) VALUES (?, ?, ?, ?)`,
        body.school_id, body.username, ip, valid ? 1 : 0
    );

    if (!user || !valid) {
        await writeAudit(env, {
            schoolId: body.school_id, actorUserId: user ? user.id : null,
            action: "auth.login_failed", entityType: "user", entityId: user ? user.id : null,
            meta: { username: body.username }, request,
        });
        throw errors.unauthorized("نام کاربری یا رمز عبور اشتباه است");
    }
    if (!user.is_active) throw errors.forbidden("حساب کاربری غیرفعال است");

    const { token, expiresAt } = await createSession(env, user, request);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id,
        action: "auth.login_success", entityType: "user", entityId: user.id, request,
    });

    const roleRows = await db.all(
        `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
        user.id
    );

    return ok({
        token,
        expires_at: expiresAt,
        user: { id: user.id, full_name: user.full_name, school_id: user.school_id },
        roles: roleRows.results.map(r => r.key),
    }, "ورود موفقیت‌آمیز بود");
});
