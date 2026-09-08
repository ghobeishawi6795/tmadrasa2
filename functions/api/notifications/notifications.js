// /api/notifications
// GET  -> list this user's notifications (most recent first) + unread_count
// POST { action: "mark_read", id } or { action: "mark_all_read" }
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const db = q(env);

    const rows = await db.all(
        `SELECT * FROM notifications WHERE user_id = ? AND school_id = ? ORDER BY created_at DESC LIMIT 100`,
        user.id, user.school_id
    );
    const unread = await db.first(
        `SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read_at IS NULL`, user.id
    );
    return ok({ notifications: rows.results, unread_count: unread.c });
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const db = q(env);
    const body = await readJson(request);
    requireFields(body, ["action"]);

    if (body.action === "mark_read") {
        requireFields(body, ["id"]);
        const notif = await db.first(`SELECT * FROM notifications WHERE id = ?`, body.id);
        if (!notif) throw errors.notFound("اعلان پیدا نشد");
        if (notif.user_id !== user.id) throw errors.forbidden("این اعلان متعلق به شما نیست");
        await db.run(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`, notif.id);
        return ok(null, "اعلان خوانده شد");
    }

    if (body.action === "mark_all_read") {
        await db.run(
            `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`,
            user.id
        );
        return ok(null, "همه اعلان‌ها خوانده شد");
    }

    throw errors.validation("action نامعتبر است");
});
