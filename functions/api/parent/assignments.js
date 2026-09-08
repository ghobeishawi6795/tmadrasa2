// GET /api/parent/assignments?student_id=123 -- assignment status only (not full submission body editing)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getParentRecord, assertParentOwnsStudent } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.view");
    const parent = await getParentRecord(env, user.id);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    if (!studentId) throw errors.validation("student_id الزامی است");
    await assertParentOwnsStudent(env, parent.id, studentId, user.school_id);

    const db = q(env);
    const rows = await db.all(
        `SELECT a.id, a.title, a.due_at, s.name as subject_name,
                sub.status as submission_status, sub.score, sub.submitted_at
           FROM assignments a
           JOIN subjects s ON s.id = a.subject_id
           JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = ?
           LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
          WHERE a.deleted_at IS NULL AND a.school_id = ?
          ORDER BY a.due_at DESC`,
        studentId, studentId, user.school_id
    );
    return ok(rows.results);
});
