// GET /api/admin/pending-questions -- school-scoped list of questions
// awaiting public-bank approval (visibility = 'pending')
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.moderate");

    const db = q(env);
    const rows = await db.all(
        `SELECT q.id, q.type, q.text, q.chapter, q.topic, q.difficulty, u.full_name as teacher_name
           FROM questions q
           JOIN teachers t ON t.id = q.teacher_id
           JOIN users u ON u.id = t.user_id
          WHERE q.school_id = ? AND q.visibility = 'pending' AND q.deleted_at IS NULL
          ORDER BY q.created_at ASC`,
        user.school_id
    );
    return ok(rows.results);
});
