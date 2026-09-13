// POST /api/teacher/find-similar-questions { text, exclude_id? }
// Jaccard similarity over normalized word tokens -- ported from دبستان's
// _lib logic almost verbatim (reuses the same normalizeSearchText already
// ported for bank search). Candidate pool is the calling teacher's OWN bank
// plus the school's approved-public bank (school_id-scoped, same rule as
// everywhere else public questions are read -- see 023_question_visibility.sql).
// A match from another teacher's public question is informational only:
// picking it up is done via copy-public-question.js, same as browsing the
// public bank directly -- this endpoint never returns someone else's
// private question.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { normalizeSearchText } from "../_shared/search-normalize.js";

function tokenize(text) {
    return normalizeSearchText(text).split(/[^a-z0-9\u0600-\u06ff]+/).filter(Boolean);
}
function jaccard(tokensA, tokensB) {
    const a = new Set(tokensA), b = new Set(tokensB);
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter);
}

const SIMILARITY_THRESHOLD = 0.4;

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["text"]);
    if (!body.text.trim()) throw errors.validation("متن سؤال الزامی است");

    const targetTokens = tokenize(body.text);
    if (!targetTokens.length) return ok([]);

    const db = q(env);
    const candidates = await db.all(
        `SELECT q.id, q.text, q.type, q.teacher_id, u.full_name as teacher_name
           FROM questions q
           JOIN teachers t ON t.id = q.teacher_id
           JOIN users u ON u.id = t.user_id
          WHERE q.school_id = ? AND q.deleted_at IS NULL AND q.id != ?
            AND (q.teacher_id = ? OR q.visibility = 'public')
          LIMIT 500`,
        user.school_id, body.exclude_id || 0, teacher.id
    );

    const matches = candidates.results
        .map(c => ({ c, similarity: jaccard(targetTokens, tokenize(c.text)) }))
        .filter(m => m.similarity >= SIMILARITY_THRESHOLD)
        .sort((x, y) => y.similarity - x.similarity)
        .slice(0, 5)
        .map(({ c, similarity }) => ({
            id: c.id, text: c.text, type: c.type,
            is_mine: c.teacher_id === teacher.id,
            teacher_name: c.teacher_id === teacher.id ? null : c.teacher_name,
            similarity_pct: Math.round(similarity * 100),
        }));

    return ok(matches);
});
