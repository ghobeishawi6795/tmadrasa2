// GET /api/parent/attendance?student_id=123&from=...&to=...
// student_id is REQUIRED and must be one of this parent's own children.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "attendance.view");
    const db = q(env);

    const parent = await db.first(
        `SELECT * FROM parents WHERE user_id = ? AND deleted_at IS NULL`, user.id
    );
    if (!parent) throw errors.forbidden("کاربر والد نیست");

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    if (!studentId) throw errors.validation("student_id الزامی است");

    // the ONLY line that decides access: is this really parent's own child?
    const link = await db.first(
        `SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ? AND school_id = ?`,
        parent.id, studentId, user.school_id
    );
    if (!link) throw errors.forbidden("این دانش‌آموز فرزند شما نیست");

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const records = await db.all(
        `SELECT ar.status, s.session_date
           FROM attendance_records ar
           JOIN attendance_sessions s ON s.id = ar.session_id
          WHERE ar.student_id = ? AND ar.school_id = ?
            AND (? IS NULL OR s.session_date >= ?)
            AND (? IS NULL OR s.session_date <= ?)
          ORDER BY s.session_date DESC`,
        studentId, user.school_id, from, from, to, to
    );

    const summary = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of records.results) summary[r.status] = (summary[r.status] || 0) + 1;

    return ok({ records: records.results, summary });
});
