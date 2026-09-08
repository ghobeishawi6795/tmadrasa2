// GET /api/student/me -- minimal self + class info, used by the frontend
// router to decide which UI (elementary/secondary) to show.
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const student = await getStudentRecord(env, user.id);
    const db = q(env);

    const cls = await db.first(
        `SELECT c.id as class_id, c.name as class_name, c.education_level
           FROM class_students cs JOIN classes c ON c.id = cs.class_id
          WHERE cs.student_id = ? AND cs.school_id = ?
          LIMIT 1`,
        student.id, user.school_id
    );

    return ok({
        full_name: user.full_name,
        class_id: cls?.class_id ?? null,
        class_name: cls?.class_name ?? null,
        education_level: cls?.education_level ?? "secondary",
    });
});
