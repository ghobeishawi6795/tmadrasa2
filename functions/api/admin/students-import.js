// POST /api/admin/students-import -- bulk-create students from a parsed CSV
// (parsing itself happens client-side; this endpoint just takes the rows,
// so it works the same whether the admin pasted CSV text or picked a file).
//
// Body: { class_id, students: [{ full_name, username, password }, ...] }
// Limits (server-side, not just client): max 500 rows per call, and each
// row is validated individually -- one bad row doesn't need to kill the
// whole batch, so failures are collected and returned alongside successes.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { hashPassword } from "../_shared/crypto.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

const MAX_ROWS = 500;

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.create");
    const body = await readJson(request);
    requireFields(body, ["class_id", "students"]);

    if (!Array.isArray(body.students) || body.students.length === 0) {
        throw errors.validation("لیست دانش‌آموزان خالی است");
    }
    if (body.students.length > MAX_ROWS) {
        throw errors.validation(`حداکثر ${MAX_ROWS} ردیف در هر بار مجاز است`);
    }

    const db = q(env);
    const cls = await db.first(
        `SELECT * FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.class_id, user.school_id
    );
    if (!cls) throw errors.notFound("کلاس پیدا نشد");

    const studentRole = await db.first(`SELECT id FROM roles WHERE key = 'student'`);

    const created = [];
    const failed = [];

    for (let i = 0; i < body.students.length; i++) {
        const row = body.students[i];
        const rowNum = i + 1;
        try {
            if (!row.full_name || !row.username || !row.password) {
                throw new Error("نام/نام‌کاربری/رمز عبور خالی است");
            }
            if (String(row.password).length < 8) {
                throw new Error("رمز عبور باید حداقل ۸ کاراکتر باشد");
            }

            const existing = await db.first(
                `SELECT id FROM users WHERE school_id = ? AND username = ?`,
                user.school_id, row.username
            );
            if (existing) throw new Error(`نام‌کاربری «${row.username}» قبلاً استفاده شده`);

            const passwordHash = await hashPassword(row.password);
            const userResult = await db.run(
                `INSERT INTO users (school_id, username, password_hash, full_name) VALUES (?, ?, ?, ?)`,
                user.school_id, row.username, passwordHash, row.full_name
            );
            const newUserId = userResult.meta.last_row_id;

            const studentResult = await db.run(
                `INSERT INTO students (user_id, school_id, student_code) VALUES (?, ?, ?)`,
                newUserId, user.school_id, row.student_code || null
            );
            const studentId = studentResult.meta.last_row_id;

            await db.run(
                `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
                newUserId, studentRole.id, user.school_id
            );

            await db.run(
                `INSERT INTO class_students (class_id, student_id, school_id) VALUES (?, ?, ?)`,
                cls.id, studentId, user.school_id
            );

            created.push({ row: rowNum, id: studentId, username: row.username });
        } catch (e) {
            failed.push({ row: rowNum, username: row.username || null, error: e.message });
        }
    }

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "students.bulk_import",
        entityType: "class", entityId: cls.id,
        meta: { class_id: cls.id, created_count: created.length, failed_count: failed.length }, request,
    });

    return ok({ created, failed }, `${created.length} دانش‌آموز ثبت شد${failed.length ? `، ${failed.length} مورد ناموفق` : ""}`);
});
