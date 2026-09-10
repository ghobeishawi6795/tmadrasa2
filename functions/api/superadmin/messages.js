// /api/superadmin/messages
// GET  -> list conversations the super-admin is a member of, across ALL
//         schools (the regular /api/messages/conversations endpoint scopes
//         everything to the caller's OWN school, which doesn't work for an
//         account that isn't attached to any real school).
// POST { school_id, body } -> start (or reuse) a conversation with every
//         admin of that school and send the first message. Sending further
//         messages in that thread uses the existing, unchanged
//         /api/messages/messages endpoint (both sides -- the school's admin
//         sees and replies to it from their own normal "پیام‌ها" page,
//         since the conversation is scoped to their own school_id there).
import { q } from "../_shared/db.js";
import { authenticate, requireRole } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const db = q(env);

    const rows = await db.all(
        `SELECT c.id, c.title, c.created_at, c.school_id, s.name as school_name,
                (SELECT body FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                  ORDER BY m.created_at DESC LIMIT 1) as last_message
           FROM conversations c
           JOIN conversation_members cm ON cm.conversation_id = c.id
           JOIN schools s ON s.id = c.school_id
          WHERE cm.user_id = ?
          ORDER BY c.created_at DESC`,
        user.id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    requireRole(roles, "super_admin");
    const body = await readJson(request);
    requireFields(body, ["school_id", "body"]);
    requireMaxLength(body.body, 5000, "متن پیام");

    const db = q(env);
    const school = await db.first(`SELECT id, name FROM schools WHERE id = ? AND id != 0`, body.school_id);
    if (!school) throw errors.notFound("مدرسه پیدا نشد");

    const admins = await db.all(
        `SELECT u.id FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
          WHERE u.school_id = ? AND u.deleted_at IS NULL AND r.key = 'admin'`,
        school.id
    );
    if (!admins.results.length) throw errors.validation("این مدرسه هیچ مدیری ندارد");

    // Reuse an existing super-admin <-> this-school conversation if one
    // already exists, instead of creating a new thread every time.
    let conversationId = (await db.first(
        `SELECT c.id FROM conversations c
           JOIN conversation_members cm ON cm.conversation_id = c.id
          WHERE c.school_id = ? AND c.type = 'group' AND c.title = '__superadmin__' AND cm.user_id = ?`,
        school.id, user.id
    ))?.id;

    if (!conversationId) {
        const result = await db.run(
            `INSERT INTO conversations (school_id, type, title) VALUES (?, 'group', '__superadmin__')`,
            school.id
        );
        conversationId = result.meta.last_row_id;

        const memberIds = [user.id, ...admins.results.map(a => a.id)];
        await db.batch(memberIds.map(uid => ({
            sql: `INSERT INTO conversation_members (conversation_id, user_id, school_id) VALUES (?, ?, ?)`,
            params: [conversationId, uid, school.id],
        })));
    }

    await db.run(
        `INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`,
        conversationId, user.id, body.body
    );

    return created({ id: conversationId }, "پیام ارسال شد");
});
