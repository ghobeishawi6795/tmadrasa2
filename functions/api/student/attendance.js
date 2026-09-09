// GET /api/student/attendance?from=2026-01-01&to=2026-06-01 (both optional)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "attendance.view");
    const student = await getStudentRecord(env, user.id);
    const db = q(env);
    const url = new URL(request.url);
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
        student.id, user.school_id, from, from, to, to
    );

    const summary = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of records.results) summary[r.status] = (summary[r.status] || 0) + 1;

    return ok({ records: records.results, summary });
});
