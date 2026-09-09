// /api/announcements
// GET  -> announcements targeted at this user's role (or "all"), most recent first
// POST { title, body, target } -> admin/teacher only (announcements.create permission)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission, hasRole } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";

const VALID_TARGETS = ["admin", "teacher", "student", "parent", "all"];

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    await requirePermission(env, user, "announcements.view");
    const db = q(env);

    // build the list of targets this user should see: "all" + each of their own roles
    const targets = ["all", ...roles];
    const placeholders = targets.map(() => "?").join(",");

    const rows = await db.all(
        `SELECT a.*, u.full_name as author_name FROM announcements a
           JOIN users u ON u.id = a.author_id
          WHERE a.school_id = ? AND a.target IN (${placeholders})
          ORDER BY a.created_at DESC LIMIT 50`,
        user.school_id, ...targets
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    await requirePermission(env, user, "announcements.create");
    if (!hasRole(roles, "admin") && !hasRole(roles, "teacher")) {
        throw errors.forbidden("فقط مدیر یا معلم می‌تواند اطلاعیه منتشر کند");
    }

    const body = await readJson(request);
    requireFields(body, ["title", "body"]);
    requireMaxLength(body.title, 200, "عنوان");
    requireMaxLength(body.body, 10000, "متن اطلاعیه");
    const target = body.target || "all";
    if (!VALID_TARGETS.includes(target)) throw errors.validation("target نامعتبر است");

    const db = q(env);
    const result = await db.run(
        `INSERT INTO announcements (school_id, author_id, title, body, target) VALUES (?, ?, ?, ?, ?)`,
        user.school_id, user.id, body.title, body.body, target
    );
    return created({ id: result.meta.last_row_id }, "اطلاعیه منتشر شد");
});
