// /api/messages/conversations
// GET  -> list conversations this user is a member of (with unread indicator)
// POST { type: "direct"|"group", title, member_user_ids: [...] } -> create + auto-add creator
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "messages.view");
    const db = q(env);

    const rows = await db.all(
        `SELECT c.id, c.type, c.title, c.created_at,
                (SELECT body FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                  ORDER BY m.created_at DESC LIMIT 1) as last_message,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) as message_count
           FROM conversations c
           JOIN conversation_members cm ON cm.conversation_id = c.id
          WHERE cm.user_id = ? AND c.school_id = ?
          ORDER BY c.created_at DESC`,
        user.id, user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "messages.create");
    const body = await readJson(request);
    requireFields(body, ["type"]);

    if (!["direct", "group"].includes(body.type)) throw errors.validation("نوع گفتگو نامعتبر است");

    const memberIds = Array.isArray(body.member_user_ids) ? body.member_user_ids : [];
    if (body.type === "direct" && memberIds.length !== 1) {
        throw errors.validation("گفتگوی مستقیم باید دقیقاً یک عضو دیگر داشته باشد");
    }

    const db = q(env);

    // every proposed member must belong to the same school — no cross-school conversations
    if (memberIds.length) {
        const placeholders = memberIds.map(() => "?").join(",");
        const validCount = await db.first(
            `SELECT COUNT(*) as c FROM users WHERE id IN (${placeholders}) AND school_id = ? AND deleted_at IS NULL`,
            ...memberIds, user.school_id
        );
        if (validCount.c !== memberIds.length) throw errors.validation("یک یا چند کاربر انتخاب‌شده معتبر نیستند");
    }

    const result = await db.run(
        `INSERT INTO conversations (school_id, type, title) VALUES (?, ?, ?)`,
        user.school_id, body.type, body.title || null
    );
    const conversationId = result.meta.last_row_id;

    const allMembers = [...new Set([user.id, ...memberIds])];
    await db.batch(allMembers.map(uid => ({
        sql: `INSERT INTO conversation_members (conversation_id, user_id, school_id) VALUES (?, ?, ?)`,
        params: [conversationId, uid, user.school_id],
    })));

    return created({ id: conversationId }, "گفتگو ساخته شد");
});
