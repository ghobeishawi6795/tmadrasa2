// /api/admin/schedules -- weekly timetable entries (day_of_week: 0=شنبه ... 6=جمعه)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "classes.view");
    const db = q(env);
    const url = new URL(request.url);
    const classId = url.searchParams.get("class_id");

    const rows = await db.all(
        `SELECT sch.id, sch.class_id, c.name as class_name, sch.subject_id, s.name as subject_name,
                sch.teacher_id, u.full_name as teacher_name, sch.day_of_week, sch.start_time, sch.end_time
           FROM schedules sch
           JOIN classes c ON c.id = sch.class_id
           JOIN subjects s ON s.id = sch.subject_id
           JOIN teachers t ON t.id = sch.teacher_id JOIN users u ON u.id = t.user_id
          WHERE sch.school_id = ? AND (? IS NULL OR sch.class_id = ?)
          ORDER BY sch.day_of_week, sch.start_time`,
        user.school_id, classId, classId
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "classes.update");
    const body = await readJson(request);
    requireFields(body, ["class_id", "subject_id", "teacher_id", "day_of_week", "start_time", "end_time"]);

    if (body.day_of_week < 0 || body.day_of_week > 6) throw errors.validation("day_of_week باید بین ۰ تا ۶ باشد");

    const db = q(env);

    // every referenced row must actually belong to this school
    const cls = await db.first(`SELECT * FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, body.class_id, user.school_id);
    if (!cls) throw errors.notFound("کلاس پیدا نشد");
    const subject = await db.first(`SELECT * FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, body.subject_id, user.school_id);
    if (!subject) throw errors.notFound("درس پیدا نشد");
    const teacher = await db.first(`SELECT * FROM teachers WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, body.teacher_id, user.school_id);
    if (!teacher) throw errors.notFound("معلم پیدا نشد");

    const result = await db.run(
        `INSERT INTO schedules (school_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        user.school_id, cls.id, subject.id, teacher.id, body.day_of_week, body.start_time, body.end_time
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "schedule.create",
        entityType: "schedule", entityId: result.meta.last_row_id,
        meta: { class_id: cls.id, subject_id: subject.id, teacher_id: teacher.id, day_of_week: body.day_of_week }, request,
    });

    return created({ id: result.meta.last_row_id }, "برنامه ثبت شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "classes.update");
    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const row = await db.first(`SELECT * FROM schedules WHERE id = ? AND school_id = ?`, body.id, user.school_id);
    if (!row) throw errors.notFound("این مورد پیدا نشد");

    await db.run(`DELETE FROM schedules WHERE id = ?`, row.id);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "schedule.delete",
        entityType: "schedule", entityId: row.id, request,
    });

    return ok(null, "مورد حذف شد");
});
