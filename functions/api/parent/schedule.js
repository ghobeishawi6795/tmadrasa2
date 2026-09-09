// GET /api/parent/schedule?student_id=123 -- the child's real weekly schedule
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getParentRecord, assertParentOwnsStudent } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const parent = await getParentRecord(env, user.id);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    if (!studentId) throw errors.validation("student_id الزامی است");
    await assertParentOwnsStudent(env, parent.id, studentId, user.school_id);

    const db = q(env);
    const classRow = await db.first(
        `SELECT class_id FROM class_students WHERE student_id = ? AND school_id = ?`,
        studentId, user.school_id
    );
    if (!classRow) throw errors.notFound("دانش‌آموز در هیچ کلاسی ثبت‌نام نشده است");

    const schedule = await db.all(
        `SELECT sch.day_of_week, sch.start_time, sch.end_time, sub.name as subject_name, u.full_name as teacher_name
           FROM schedules sch
           JOIN subjects sub ON sub.id = sch.subject_id
           JOIN teachers t ON t.id = sch.teacher_id
           JOIN users u ON u.id = t.user_id
          WHERE sch.class_id = ? AND sch.school_id = ?
          ORDER BY sch.day_of_week, sch.start_time`,
        classRow.class_id, user.school_id
    );
    return ok(schedule.results);
});
