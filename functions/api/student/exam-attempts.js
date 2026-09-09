// GET /api/student/exam-attempts -- every attempt this student has made, across all exams.
// Fills a real gap: previously the only way to see a result was to already know
// the attempt_id (only returned once, at start/submit time).
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const student = await getStudentRecord(env, user.id);
    const db = q(env);

    const rows = await db.all(
        `SELECT att.id as attempt_id, att.exam_id, e.title as exam_title, s.name as subject_name,
                att.status, att.total_score, att.max_score, att.started_at, att.submitted_at
           FROM exam_attempts att
           JOIN exams e ON e.id = att.exam_id
           JOIN subjects s ON s.id = e.subject_id
          WHERE att.student_id = ? AND att.school_id = ?
          ORDER BY att.started_at DESC`,
        student.id, user.school_id
    );
    return ok(rows.results);
});
