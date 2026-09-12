// POST /api/teacher/find-similar-questions { text, exclude_id? }
// Jaccard similarity over normalized word tokens -- ported from دبستان's
// _lib logic almost verbatim (reuses the same normalizeSearchText already
// ported for bank search). Scoped to the CALLING TEACHER's own bank only:
// unlike دبستان, مدرسه's question bank has no cross-teacher visibility yet
// (that's item 4 on the ranked list, still open) -- once a shared/public
// bank exists this can naturally widen to school-wide.
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
        `SELECT id, text, type FROM questions
          WHERE teacher_id = ? AND school_id = ? AND deleted_at IS NULL AND id != ?
          LIMIT 500`,
        teacher.id, user.school_id, body.exclude_id || 0
    );

    const matches = candidates.results
        .map(c => ({ c, similarity: jaccard(targetTokens, tokenize(c.text)) }))
        .filter(m => m.similarity >= SIMILARITY_THRESHOLD)
        .sort((x, y) => y.similarity - x.similarity)
        .slice(0, 5)
        .map(({ c, similarity }) => ({ id: c.id, text: c.text, type: c.type, similarity_pct: Math.round(similarity * 100) }));

    return ok(matches);
});
