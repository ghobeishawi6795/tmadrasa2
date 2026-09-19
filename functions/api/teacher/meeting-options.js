// GET /api/teacher/meeting-options -- the students in this teacher's (current-year) classes,
// each with the parents linked to them; feeds the "schedule a meeting" form on teacher/meetings.html.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "meetings.manage");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);
    const db = q(env);
    const rows = await db.all(
        `SELECT s.id AS student_id, su.full_name AS student_name, c.name AS class_name,
                p.id AS parent_id, pu.full_name AS parent_name
           FROM class_teachers ct
           JOIN classes c ON c.id = ct.class_id AND c.school_id = ct.school_id AND c.deleted_at IS NULL
           JOIN class_students cs ON cs.class_id = ct.class_id AND cs.school_id = ct.school_id
           JOIN students s ON s.id = cs.student_id AND s.deleted_at IS NULL
           JOIN users su ON su.id = s.user_id
           LEFT JOIN parent_students ps ON ps.student_id = s.id AND ps.school_id = ct.school_id
           LEFT JOIN parents p ON p.id = ps.parent_id AND p.deleted_at IS NULL
           LEFT JOIN users pu ON pu.id = p.user_id
          WHERE ct.teacher_id = ? AND ct.school_id = ?
            AND (c.academic_year_id IS NULL OR c.academic_year_id = COALESCE(
                  (SELECT id FROM academic_years WHERE school_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1),
                  c.academic_year_id))
          ORDER BY c.name, su.full_name`,
        teacher.id, user.school_id, user.school_id
    );
    const byStudent = new Map();
    for (const r of rows.results) {
        let st = byStudent.get(r.student_id);
        if (!st) {
            st = { student_id: r.student_id, student_name: r.student_name, class_name: r.class_name, parents: [] };
            byStudent.set(r.student_id, st);
        }
        if (r.parent_id && !st.parents.some(p => p.parent_id === r.parent_id)) {
            st.parents.push({ parent_id: r.parent_id, parent_name: r.parent_name });
        }
    }
    return ok([...byStudent.values()]);
});
