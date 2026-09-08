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

    if (body.password.length < 8) {
        throw errors.validation("رمز عبور باید حداقل ۸ کاراکتر باشد");
    }

    const db = q(env);

    const schoolResult = await db.run(
        `INSERT INTO schools (name, phone, address) VALUES (?, ?, ?)`,
        body.school_name, body.school_phone || null, body.school_address || null
    );
    const schoolId = schoolResult.meta.last_row_id;

    const passwordHash = await hashPassword(body.password);

    const userResult = await db.run(
        `INSERT INTO users (school_id, username, password_hash, full_name, phone, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        schoolId, body.username, passwordHash, body.admin_full_name,
        body.phone || null, body.email || null
    );
    const userId = userResult.meta.last_row_id;

    const adminRole = await db.first(`SELECT id FROM roles WHERE key = 'admin'`);
    await db.run(
        `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
        userId, adminRole.id, schoolId
    );

    await writeAudit(env, {
        schoolId, actorUserId: userId, action: "school.register",
        entityType: "school", entityId: schoolId,
        meta: { admin_username: body.username }, request,
    });

    return ok({ school_id: schoolId, user_id: userId }, "مدرسه و حساب مدیر با موفقیت ساخته شد");
});
