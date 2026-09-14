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
        `SELECT s.id, u.id as user_id, s.student_code, u.full_name, u.username, u.is_active,
                c.id as class_id, c.name as class_name, c.grade as class_grade
           FROM students s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN class_students cs ON cs.student_id = s.id
           LEFT JOIN classes c ON c.id = cs.class_id AND c.deleted_at IS NULL
          WHERE s.school_id = ? AND s.deleted_at IS NULL
          ${classId ? "AND cs.class_id = ?" : ""}
          ORDER BY u.full_name`,
        ...(classId ? [user.school_id, classId] : [user.school_id])
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
    const studentRole = await db.first(`SELECT id FROM roles WHERE key = 'student'`);

    // BUGFIX: this used to be 4 separate INSERTs with manual cleanup-on-error
    // (D1 can't bind a generated id into a later statement before it exists),
    // which meant a mid-sequence DB failure could still leave a half-created
    // person if the cleanup itself failed. Fixed properly now: every
    // dependent id is resolved via a SQL subquery keyed on the just-checked
    // -unique `username` instead of a JS-bound value, so all 4 statements can
    // go through db.batch() as ONE real D1 transaction -- either all of them
    // land, or (on any failure, e.g. a race on the username uniqueness check
    // above) none of them do. No manual rollback needed anymore.
    await db.batch([
        {
            sql: `INSERT INTO users (school_id, username, password_hash, full_name, phone)
                  VALUES (?, ?, ?, ?, ?)`,
            params: [user.school_id, body.username, passwordHash, body.full_name, body.phone || null],
        },
        {
            sql: `INSERT INTO students (user_id, school_id, student_code)
                  VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
            params: [user.school_id, body.username, user.school_id, body.student_code || null],
        },
        {
            sql: `INSERT INTO user_roles (user_id, role_id, school_id)
                  VALUES ((SELECT id FROM users WHERE school_id = ? AND username = ?), ?, ?)`,
            params: [user.school_id, body.username, studentRole.id, user.school_id],
        },
        {
            sql: `INSERT INTO class_students (class_id, student_id, school_id)
                  VALUES (?, (SELECT id FROM students WHERE user_id = (SELECT id FROM users WHERE school_id = ? AND username = ?)), ?)`,
            params: [cls.id, user.school_id, body.username, user.school_id],
        },
    ]);

    const created_ = await db.first(
        `SELECT u.id as user_id, s.id as student_id FROM users u JOIN students s ON s.user_id = u.id
          WHERE u.school_id = ? AND u.username = ?`,
        user.school_id, body.username
    );
    const newUserId = created_.user_id;
    const studentId = created_.student_id;

    // best-effort: a logging failure here must never make an already-successful
    // registration look like it failed to the person who just submitted the form
    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "student.create",
        entityType: "student", entityId: studentId,
        meta: { username: body.username, class_id: cls.id }, request,
    }).catch(() => {});

    return created({ id: studentId, user_id: newUserId }, "دانش‌آموز ثبت شد");
});
