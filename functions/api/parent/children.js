// GET /api/parent/children -- list of this parent's own children only
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getParentRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const parent = await getParentRecord(env, user.id);
    const db = q(env);

    const rows = await db.all(
        `SELECT st.id as student_id, u.full_name, c.name as class_name, c.id as class_id, c.education_level
           FROM parent_students ps
           JOIN students st ON st.id = ps.student_id
           JOIN users u ON u.id = st.user_id
           LEFT JOIN class_students cs ON cs.student_id = st.id
           LEFT JOIN classes c ON c.id = cs.class_id AND c.deleted_at IS NULL
          WHERE ps.parent_id = ? AND ps.school_id = ? AND st.deleted_at IS NULL`,
        parent.id, user.school_id
    );
    return ok(rows.results);
});
