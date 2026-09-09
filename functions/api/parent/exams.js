// GET /api/parent/exams?student_id=123 -- results only, never questions/answer keys
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getParentRecord, assertParentOwnsStudent } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.view");
    const parent = await getParentRecord(env, user.id);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    if (!studentId) throw errors.validation("student_id الزامی است");
    await assertParentOwnsStudent(env, parent.id, studentId, user.school_id);

    const db = q(env);
    const rows = await db.all(
        `SELECT e.id as exam_id, e.title, e.start_at, s.name as subject_name,
                att.status as attempt_status, att.total_score, att.max_score, att.submitted_at
           FROM exams e
           JOIN subjects s ON s.id = e.subject_id
           JOIN class_students cs ON cs.class_id = e.class_id AND cs.student_id = ?
           LEFT JOIN exam_attempts att ON att.exam_id = e.id AND att.student_id = ?
          WHERE e.deleted_at IS NULL AND e.school_id = ? AND e.status IN ('published','closed','archived')
          ORDER BY e.start_at DESC`,
        studentId, studentId, user.school_id
    );
    return ok(rows.results);
});
