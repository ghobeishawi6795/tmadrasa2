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

    const passwordHash = await hashPassword(body.password);
    const userResult = await db.run(
        `INSERT INTO users (school_id, username, password_hash, full_name, phone)
         VALUES (?, ?, ?, ?, ?)`,
        user.school_id, body.username, passwordHash, body.full_name, body.phone || null
    );
    const newUserId = userResult.meta.last_row_id;

    const studentResult = await db.run(
        `INSERT INTO students (user_id, school_id, student_code) VALUES (?, ?, ?)`,
        newUserId, user.school_id, body.student_code || null
    );
    const studentId = studentResult.meta.last_row_id;

    const studentRole = await db.first(`SELECT id FROM roles WHERE key = 'student'`);
    await db.run(
        `INSERT INTO user_roles (user_id, role_id, school_id) VALUES (?, ?, ?)`,
        newUserId, studentRole.id, user.school_id
    );

    await db.run(
        `INSERT INTO class_students (class_id, student_id, school_id) VALUES (?, ?, ?)`,
        cls.id, studentId, user.school_id
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "student.create",
        entityType: "student", entityId: studentId,
        meta: { username: body.username, class_id: cls.id }, request,
    });

    return created({ id: studentId, user_id: newUserId }, "دانش‌آموز ثبت شد");
});
