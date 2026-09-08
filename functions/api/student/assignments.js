// GET /api/student/assignments -- assignments for classes this student is enrolled in,
// each annotated with the student's own latest submission (if any).
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";
import { sanitizeForStudent } from "../_shared/interactive.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.view");
    const student = await getStudentRecord(env, user.id);

    const db = q(env);
    const rows = await db.all(
        `SELECT a.id, a.title, a.description, a.due_at, a.allow_late, a.max_attempts, a.max_score,
                a.submission_type, a.question_payload, s.name as subject_name, c.name as class_name,
                sub.id as submission_id, sub.status as submission_status,
                sub.score as submission_score, sub.attempt_number as submission_attempt_number
           FROM assignments a
           JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = ?
           JOIN subjects s ON s.id = a.subject_id
           JOIN classes c ON c.id = a.class_id
           LEFT JOIN submissions sub ON sub.id = (
               SELECT id FROM submissions
                WHERE assignment_id = a.id AND student_id = ?
                ORDER BY attempt_number DESC LIMIT 1
           )
          WHERE a.school_id = ? AND a.deleted_at IS NULL
          ORDER BY a.due_at ASC`,
        student.id, student.id, user.school_id
    );

    // For match/drag_drop, replace the raw (answer-key-containing) payload with
    // a client-safe version -- see interactive.js for why this can't just be
    // "hide one field", the correct mapping has to actually be stripped out.
    // For every other type there's still nothing to strip (text/photo/audio/draw
    // are all manually graded), same as before.
    const sanitized = rows.results.map(row => {
        const { question_payload, ...rest } = row;
        if (question_payload && (row.submission_type === "match" || row.submission_type === "drag_drop")) {
            rest.interactive = sanitizeForStudent(row);
        }
        return rest;
    });

    return ok(sanitized);
});
