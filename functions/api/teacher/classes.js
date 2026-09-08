// GET /api/teacher/classes -- the classes/subjects THIS teacher actually teaches
// (unlike /api/admin/classes, which lists the whole school and was only usable
// by teachers as a stopgap because they share the classes.view permission)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "classes.view");
    const teacher = await getTeacherRecord(env, user.id);
    const db = q(env);

    const rows = await db.all(
        `SELECT ta.id as teaching_assignment_id, c.id as class_id, c.name as class_name, c.grade,
                s.id as subject_id, s.name as subject_name
           FROM teaching_assignments ta
           JOIN classes c ON c.id = ta.class_id AND c.deleted_at IS NULL
           JOIN subjects s ON s.id = ta.subject_id AND s.deleted_at IS NULL
          WHERE ta.teacher_id = ? AND ta.school_id = ?
          ORDER BY c.name, s.name`,
        teacher.id, user.school_id
    );
    return ok(rows.results);
});
