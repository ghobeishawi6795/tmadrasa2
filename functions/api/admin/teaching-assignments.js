// /api/admin/teaching-assignments -- assign/unassign a teacher to teach a subject in a class
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "teachers.view");
    const db = q(env);
    const rows = await db.all(
        `SELECT ta.id, ta.teacher_id, u.full_name as teacher_name,
                ta.class_id, c.name as class_name, ta.subject_id, s.name as subject_name
           FROM teaching_assignments ta
           JOIN teachers t ON t.id = ta.teacher_id JOIN users u ON u.id = t.user_id
           JOIN classes c ON c.id = ta.class_id
           JOIN subjects s ON s.id = ta.subject_id
          WHERE ta.school_id = ?
          ORDER BY u.full_name, c.name`,
        user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "teachers.update");
    const body = await readJson(request);
    requireFields(body, ["teacher_id", "class_id", "subject_id"]);

    const db = q(env);

    const teacher = await db.first(`SELECT * FROM teachers WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, body.teacher_id, user.school_id);
    if (!teacher) throw errors.notFound("معلم پیدا نشد");
    const cls = await db.first(`SELECT * FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, body.class_id, user.school_id);
    if (!cls) throw errors.notFound("کلاس پیدا نشد");
    const subject = await db.first(`SELECT * FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, body.subject_id, user.school_id);
    if (!subject) throw errors.notFound("درس پیدا نشد");

    let result;
    try {
        result = await db.run(
            `INSERT INTO teaching_assignments (school_id, teacher_id, class_id, subject_id) VALUES (?, ?, ?, ?)`,
            user.school_id, teacher.id, cls.id, subject.id
        );
    } catch (e) {
        throw errors.conflict("این معلم قبلاً برای این کلاس/درس ثبت شده است");
    }

    // class_teachers is a separate table that assertClassOwnedByTeacher() (used by
    // exams/assignments ownership checks) reads from -- keep it in sync so a teacher
    // assigned here can actually create exams/assignments for this class.
    await db.run(
        `INSERT OR IGNORE INTO class_teachers (class_id, teacher_id, school_id) VALUES (?, ?, ?)`,
        cls.id, teacher.id, user.school_id
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "teaching_assignment.create",
        entityType: "teaching_assignment", entityId: result.meta.last_row_id,
        meta: { teacher_id: teacher.id, class_id: cls.id, subject_id: subject.id }, request,
    });

    return created({ id: result.meta.last_row_id }, "معلم به کلاس/درس متصل شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "teachers.update");
    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const row = await db.first(`SELECT * FROM teaching_assignments WHERE id = ? AND school_id = ?`, body.id, user.school_id);
    if (!row) throw errors.notFound("این تخصیص پیدا نشد");

    await db.run(`DELETE FROM teaching_assignments WHERE id = ?`, row.id);

    // only drop the class_teachers link if this was the teacher's last subject in that class
    const stillTeaches = await db.first(
        `SELECT 1 FROM teaching_assignments WHERE teacher_id = ? AND class_id = ? AND school_id = ?`,
        row.teacher_id, row.class_id, user.school_id
    );
    if (!stillTeaches) {
        await db.run(
            `DELETE FROM class_teachers WHERE teacher_id = ? AND class_id = ? AND school_id = ?`,
            row.teacher_id, row.class_id, user.school_id
        );
    }

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "teaching_assignment.delete",
        entityType: "teaching_assignment", entityId: row.id, request,
    });

    return ok(null, "تخصیص حذف شد");
});
