// /api/admin/students -- create a student user + student record + enroll in a class
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { hashPassword } from "../_shared/crypto.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.view");
    const db = q(env);
    const url = new URL(request.url);
    const classId = url.searchParams.get("class_id");

    const rows = await db.all(
        `SELECT s.id, u.id as user_id, s.student_code, u.full_name, u.username, u.is_active
           FROM students s JOIN users u ON u.id = s.user_id
           ${classId ? "JOIN class_students cs ON cs.student_id = s.id AND cs.class_id = ?" : ""}
          WHERE s.school_id = ? AND s.deleted_at IS NULL
          ORDER BY u.full_name`,
        ...(classId ? [classId, user.school_id] : [user.school_id])
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "students.create");
    const body = await readJson(request);
    requireFields(body, ["full_name", "username", "password", "class_id"]);

    const db = q(env);

    const cls = await db.first(
        `SELECT * FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.class_id, user.school_id
    );
    if (!cls) throw errors.notFound("کلاس پیدا نشد");

    const existing = await db.first(
        `SELECT id FROM users WHERE school_id = ? AND username = ?`,
        user.school_id, body.username
    );
    if (existing) throw errors.conflict("این نام کاربری قبلاً استفاده شده — یک نام کاربری دیگر انتخاب کنید");

    const passwordHash = await hashPassword(body.password);
    let newUserId = null;
    let studentId = null;
    try {
        const userResult = await db.run(
            `INSERT INTO users (school_id, username, password_hash, full_name, phone)
             VALUES (?, ?, ?, ?, ?)`,
            user.school_id, body.username, passwordHash, body.full_name, body.phone || null
        );
        newUserId = userResult.meta.last_row_id;

        const studentResult = await db.run(
            `INSERT INTO students (user_id, school_id, student_code) VALUES (?, ?, ?)`,
            newUserId, user.school_id, body.student_code || null
        );
        studentId = studentResult.meta.last_row_id;

        const studentRole = await db.first(`SELECT id FROM roles WHERE key = 'student'`);
        await db.run(
            `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
            newUserId, studentRole.id, user.school_id
        );

        await db.run(
            `INSERT INTO class_students (class_id, student_id, school_id) VALUES (?, ?, ?)`,
            cls.id, studentId, user.school_id
        );
    } catch (e) {
        // These inserts depend on each other's generated ids, so D1 can't run
        // them as one atomic transaction -- if anything after the `users`
        // row failed, clean up everything we already created ourselves.
        // Otherwise the username is stuck "taken" forever with no student to
        // show for it (exactly what happened with a partial "ahmad2" row).
        if (studentId) {
            await db.run(`DELETE FROM class_students WHERE student_id = ?`, studentId).catch(() => {});
            await db.run(`DELETE FROM students WHERE id = ?`, studentId).catch(() => {});
        }
        if (newUserId) {
            await db.run(`DELETE FROM user_roles WHERE user_id = ?`, newUserId).catch(() => {});
            await db.run(`DELETE FROM users WHERE id = ?`, newUserId).catch(() => {});
        }
        throw e;
    }

    // best-effort: a logging failure here must never make an already-successful
    // registration look like it failed to the person who just submitted the form
    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "student.create",
        entityType: "student", entityId: studentId,
        meta: { username: body.username, class_id: cls.id }, request,
    }).catch(() => {});

    return created({ id: studentId, user_id: newUserId }, "دانش‌آموز ثبت شد");
});
