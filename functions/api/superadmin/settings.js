// GET/PATCH /api/superadmin/settings -- super_admin only.
// Currently manages: persistent_login (bool, see /api/public/settings for
// the read-only public mirror the login pages use).
import { q } from "../_shared/db.js";
import { authenticate, requireRole } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { readJson, requireFields, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const db = q(env);
    const row = await db.first(`SELECT value FROM system_settings WHERE key = 'persistent_login'`);
    return ok({ persistent_login: row ? row.value === "1" : true });
});

export const onRequestPatch = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const body = await readJson(request);
    requireFields(body, ["persistent_login"]);
    if (typeof body.persistent_login !== "boolean") throw errors.validation("مقدار نامعتبر است");

    const db = q(env);
    await db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('persistent_login', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        body.persistent_login ? "1" : "0"
    );
    await writeAudit(env, {
        schoolId: 0, actorUserId: user.id,
        action: "superadmin.settings_update", entityType: "system_settings", entityId: null,
        meta: { persistent_login: body.persistent_login }, request,
    });
    return ok(null, "تنظیمات بروزرسانی شد");
});
