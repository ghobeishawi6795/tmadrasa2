// /api/admin/school -- per-school branding settings (name, logo, primary color)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

// Logo is stored as base64 in D1 (no R2/blob storage in this project -- same
// pattern as submissions' photo/audio). Capped smaller than a submission photo
// since a nav-bar logo doesn't need to be large.
const MAX_LOGO_CHARS = 200_000; // ~200KB of base64 (~145KB raw binary)
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "school.update");
    const db = q(env);
    const school = await db.first(
        `SELECT name, logo_data, primary_color FROM schools WHERE id = ?`,
        user.school_id
    );
    if (!school) throw errors.notFound("مدرسه پیدا نشد");
    return ok(school);
});

export const onRequestPatch = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "school.update");
    const body = await readJson(request);

    if (body.primary_color !== undefined && body.primary_color !== null && body.primary_color !== "") {
        if (!COLOR_RE.test(body.primary_color)) {
            throw errors.validation("رنگ باید به فرمت هگز باشد، مثل #5b5ce2");
        }
    }
    if (body.logo_data && body.logo_data.length > MAX_LOGO_CHARS) {
        throw errors.validation(`حجم لوگو بیش از حد مجاز است (حداکثر ${Math.floor(MAX_LOGO_CHARS / 1000)}KB)`);
    }

    const db = q(env);
    const fields = [];
    const values = [];
    if (body.name !== undefined && body.name.trim()) { fields.push("name = ?"); values.push(body.name.trim()); }
    if (body.primary_color !== undefined) { fields.push("primary_color = ?"); values.push(body.primary_color || null); }
    if (body.logo_data !== undefined) { fields.push("logo_data = ?"); values.push(body.logo_data || null); }

    if (!fields.length) throw errors.validation("هیچ فیلدی برای بروزرسانی ارسال نشده است");
    fields.push("updated_at = datetime('now')");

    await db.run(
        `UPDATE schools SET ${fields.join(", ")} WHERE id = ?`,
        ...values, user.school_id
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "school.branding_update",
        entityType: "school", entityId: user.school_id,
        meta: { updated_fields: Object.keys(body) }, request,
    });

    return ok(null, "تنظیمات مدرسه بروزرسانی شد");
});
