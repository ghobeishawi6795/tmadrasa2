// GET /api/school/branding -- read-only, any authenticated role.
// Used by every dashboard (admin/teacher/student/parent) to paint the shared
// header with the school's own logo/color. Same "auth-only, no extra
// permission" pattern as /api/student/me -- it's self-scoped info every
// logged-in user of the school is entitled to see, not an admin-only setting.
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const db = q(env);
    const school = await db.first(
        `SELECT name, logo_data, primary_color FROM schools WHERE id = ?`,
        user.school_id
    );
    if (!school) throw errors.notFound("مدرسه پیدا نشد");
    return ok(school);
});
