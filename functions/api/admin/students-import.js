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
    if (!studentRole) throw errors.server('نقش دانش‌آموز در پایگاه‌داده وجود ندارد');
    const currentYear = await db.first(`SELECT id FROM academic_years WHERE school_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1`, user.school_id);
    if (!currentYear) throw errors.conflict('برای این مدرسه سال تحصیلی جاری تعریف نشده است');

    const created = [];
    const failed = [];

    for (let i = 0; i < body.students.length; i++) {
        const row = body.students[i];
        const rowNum = i + 1;
        try {
            if (typeof row.full_name !== "string" || !row.full_name.trim() || row.full_name.trim().length > 200 || typeof row.username !== "string" || !row.username.trim() || row.username.length > 100 || !row.password) {
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
            // BUGFIX: same fix as admin/students.js (single-add) -- switched
            // from 4 dependent INSERTs + manual cleanup-on-error to one real
            // db.batch() transaction per row, with dependent ids resolved via
            // a subquery on the just-checked-unique `username`. A failure
            // partway through now rolls back that row's inserts atomically
            // instead of relying on best-effort compensating deletes.
            await db.batch([
                {
                    sql: `INSERT INTO users (school_id, username, password_hash, full_name) VALUES (?, ?, ?, ?)`,
                    params: [user.school_id, row.username, passwordHash, row.full_name],
                },
                {
                    sql: `INSERT INTO students (user_id, school_id, student_code)
                          VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
                    params: [user.school_id, row.username, user.school_id, row.student_code || null],
                },
                {
                    sql: `INSERT INTO user_roles (user_id, role_id, school_id)
                          VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
                    params: [user.school_id, row.username, studentRole.id, user.school_id],
                },
                {
                    sql: `INSERT INTO class_students (class_id, student_id, school_id)
                          VALUES (?, (SELECT id FROM students WHERE user_id = (SELECT id FROM users WHERE school_id = ? AND username = ?)), ?)`,
                    params: [cls.id, user.school_id, row.username, user.school_id],
                },
                {
                    sql: `INSERT INTO student_enrollments (school_id, academic_year_id, student_id, class_id, status, joined_at)
                          VALUES (?, ?, (SELECT id FROM students WHERE user_id = (SELECT id FROM users WHERE school_id = ? AND username = ?)), ?, 'active', datetime('now'))`,
                    params: [user.school_id, currentYear.id, user.school_id, row.username, cls.id],
                },
            ]);

            const createdRow = await db.first(
                `SELECT s.id FROM users u JOIN students s ON s.user_id = u.id WHERE u.school_id = ? AND u.username = ?`,
                user.school_id, row.username
            );
            const studentId = createdRow.id;

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
