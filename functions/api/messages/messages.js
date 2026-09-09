// /api/messages/messages
// GET    ?conversation_id=123          -> messages (member-only)
// POST   { conversation_id, body, reply_to_id? } -> send
// PUT    { id, body }                  -> edit own message only
// DELETE { id }                        -> soft delete own message only
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";

async function assertMember(db, conversationId, userId) {
    const row = await db.first(
        `SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?`,
        conversationId, userId
    );
    if (!row) throw errors.forbidden("شما عضو این گفتگو نیستید");
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "messages.view");
    const db = q(env);

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) throw errors.validation("conversation_id الزامی است");
    await assertMember(db, conversationId, user.id);

    const rows = await db.all(
        `SELECT m.id, m.body, m.reply_to_id, m.edited_at, m.deleted_at, m.created_at,
                m.sender_id, u.full_name as sender_name
           FROM messages m JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = ?
          ORDER BY m.created_at ASC`,
        conversationId
    );

    // hide the body of soft-deleted messages, but keep the row for thread continuity
    const results = rows.results.map(m => m.deleted_at ? { ...m, body: null } : m);
    return ok(results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "messages.create");
    const db = q(env);
    const body = await readJson(request);
    requireFields(body, ["conversation_id", "body"]);
    requireMaxLength(body.body, 5000, "متن پیام");
    await assertMember(db, body.conversation_id, user.id);

    if (body.reply_to_id) {
        const original = await db.first(
            `SELECT 1 FROM messages WHERE id = ? AND conversation_id = ?`,
            body.reply_to_id, body.conversation_id
        );
        if (!original) throw errors.validation("پیام مرجع در همین گفتگو نیست");
    }

    const result = await db.run(
        `INSERT INTO messages (conversation_id, sender_id, body, reply_to_id) VALUES (?, ?, ?, ?)`,
        body.conversation_id, user.id, body.body, body.reply_to_id || null
    );
    return created({ id: result.meta.last_row_id }, "پیام ارسال شد");
});

export const onRequestPut = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const db = q(env);
    const body = await readJson(request);
    requireFields(body, ["id", "body"]);
    requireMaxLength(body.body, 5000, "متن پیام");
    if (!message || message.deleted_at) throw errors.notFound("پیام پیدا نشد");
    if (message.sender_id !== user.id) throw errors.forbidden("فقط نویسنده پیام می‌تواند آن را ویرایش کند");

    await db.run(`UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?`, body.body, message.id);
    return ok(null, "پیام ویرایش شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const db = q(env);
    const body = await readJson(request);
    requireFields(body, ["id"]);

    const message = await db.first(`SELECT * FROM messages WHERE id = ?`, body.id);
    if (!message || message.deleted_at) throw errors.notFound("پیام پیدا نشد");
    if (message.sender_id !== user.id) throw errors.forbidden("فقط نویسنده پیام می‌تواند آن را حذف کند");

    await db.run(`UPDATE messages SET deleted_at = datetime('now') WHERE id = ?`, message.id);
    return ok(null, "پیام حذف شد");
});
