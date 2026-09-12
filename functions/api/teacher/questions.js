// /api/teacher/questions  -- question bank, independent of any single exam
// GET  -> list this teacher's questions
// POST -> create a question (with options for multiple_choice)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";
import { snapshotQuestionVersion } from "../_shared/question-versions.js";
import { normalizeSearchText, normalizeSql } from "../_shared/search-normalize.js";

const VALID_TYPES = ["multiple_choice", "true_false", "numeric", "short_answer", "long_answer", "fill_blank", "custom_html"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const VALID_GRADING_MODES = ["auto", "manual"];
const CUSTOM_HTML_MAX_CHARS = 50000;

// fill_blank is the only type where the teacher actually chooses -- the
// other types' grading mode is a fixed fact about the type itself, so we
// just record the reality rather than trust client input for them.
// custom_html is ALWAYS manual, never a teacher choice -- see 022_custom_html.sql
// for why a client-reported score is never trusted for auto-grading.
function resolveGradingMode(type, requested) {
    if (type === "fill_blank") {
        if (requested && !VALID_GRADING_MODES.includes(requested)) throw errors.validation("نحوه‌ی تصحیح نامعتبر است");
        return requested || "auto";
    }
    return (type === "multiple_choice" || type === "true_false" || type === "numeric") ? "auto" : "manual";
}

// A teacher can ask for 'public' but never grant it directly -- that
// becomes 'pending' until admin/moderate-question.js approves it, UNLESS
// it's already 'public' or 'pending' (re-saving an edit with the same
// share-checkbox still checked must not re-trigger moderation every time).
// Omitting visibility entirely (e.g. editing unrelated fields with no
// share-checkbox in the payload at all) must NOT reset an already-shared
// question back to private -- callers pass `undefined` in that case and
// this returns undefined so the SQL COALESCE keeps whatever was already there.
function resolveVisibility(requested, current) {
    if (requested === undefined) return undefined;
    if (requested === "public") {
        if (current === "public" || current === "pending") return current;
        return "pending";
    }
    if (requested === "private" || requested === null) return "private";
    throw errors.validation("visibility نامعتبر است");
}

// Shared validation + normalization for the metadata fields (chapter/topic/
// explanation/tags/difficulty) -- same fields for create and update.
function readMetadata(body) {
    if (body.difficulty && !VALID_DIFFICULTIES.includes(body.difficulty)) {
        throw errors.validation("سطح سختی نامعتبر است");
    }
    requireMaxLength(body.chapter, 200, "فصل");
    requireMaxLength(body.topic, 200, "مبحث");
    requireMaxLength(body.explanation, 5000, "توضیح پاسخ");
    requireMaxLength(body.tags, 500, "برچسب‌ها");

    return {
        chapter: body.chapter || null,
        topic: body.topic || null,
        explanation: body.explanation || null,
        // stored as comma-separated text -- trims stray whitespace around each tag
        tags: Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean).join(",") : (body.tags || null),
        difficulty: body.difficulty || null,
    };
}

// Creates one question (+ options if multiple_choice) and freezes version 1.
// Shared by onRequestPost and by teacher/question-templates.js (applying a
// starter pack loops this once per question in the pack, instead of
// duplicating the insert/validate/snapshot logic).
export async function createQuestionRecord(env, { schoolId, teacherId, body }) {
    if (!VALID_TYPES.includes(body.type)) throw errors.validation("نوع سؤال نامعتبر است");
    if (body.type === "custom_html") {
        if (!body.custom_html || !body.custom_html.trim()) throw errors.validation("محتوای HTML الزامی است");
        requireMaxLength(body.custom_html, CUSTOM_HTML_MAX_CHARS, "محتوای HTML");
    }
    const meta = readMetadata(body);
    const db = q(env);

    const result = await db.run(
        `INSERT INTO questions (school_id, teacher_id, subject_id, type, text,
                                 correct_boolean, correct_numeric, numeric_tolerance, correct_text,
                                 chapter, topic, explanation, tags, difficulty, grading_mode, custom_html, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        schoolId, teacherId, body.subject_id || null, body.type, body.text,
        body.type === "true_false" ? (body.correct_boolean ? 1 : 0) : null,
        body.type === "numeric" ? body.correct_numeric : null,
        body.type === "numeric" ? (body.numeric_tolerance || 0) : null,
        (body.type === "short_answer" || body.type === "long_answer" || body.type === "fill_blank") ? (body.correct_text || null) : null,
        meta.chapter, meta.topic, meta.explanation, meta.tags, meta.difficulty,
        resolveGradingMode(body.type, body.grading_mode),
        body.type === "custom_html" ? body.custom_html : null,
        resolveVisibility(body.visibility, undefined) || "private"
    );
    const questionId = result.meta.last_row_id;

    if (body.type === "multiple_choice") {
        if (!Array.isArray(body.options) || body.options.length < 2) {
            throw errors.validation("سؤال چندگزینه‌ای باید حداقل دو گزینه داشته باشد");
        }
        const correctCount = body.options.filter(o => o.is_correct).length;
        if (correctCount !== 1) throw errors.validation("دقیقاً یک گزینه صحیح باید مشخص شود");

        let correctOptionId = null;
        for (const opt of body.options) {
            const r = await db.run(
                `INSERT INTO question_options (question_id, text, is_correct) VALUES (?, ?, ?)`,
                questionId, opt.text, opt.is_correct ? 1 : 0
            );
            if (opt.is_correct) correctOptionId = r.meta.last_row_id;
        }
        await db.run(`UPDATE questions SET correct_option_id = ? WHERE id = ?`, correctOptionId, questionId);
    }

    await snapshotQuestionVersion(env, questionId);
    return questionId;
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") || "mine"; // mine | public
    const search = url.searchParams.get("search");
    const type = url.searchParams.get("type");
    const difficulty = url.searchParams.get("difficulty");
    const chapter = url.searchParams.get("chapter");
    const subjectId = url.searchParams.get("subject_id");
    const favoriteOnly = url.searchParams.get("favorite") === "1";
    const tag = url.searchParams.get("tag");

    // "public" browses the whole SCHOOL's approved-public bank (any
    // teacher's), always still school_id-scoped -- see 023_question_visibility.sql
    // for why that scoping matters (a subtle cross-tenant gap noticed in
    // دبستان's own equivalent query was deliberately not repeated here).
    const where = scope === "public"
        ? ["school_id = ?", "visibility = 'public'", "deleted_at IS NULL"]
        : ["teacher_id = ?", "school_id = ?", "deleted_at IS NULL"];
    const binds = scope === "public" ? [user.school_id] : [teacher.id, user.school_id];

    if (search) {
        const ns = normalizeSearchText(search);
        where.push(`(${normalizeSql("text")} LIKE ? OR ${normalizeSql("COALESCE(chapter,'')")} LIKE ? OR ${normalizeSql("COALESCE(topic,'')")} LIKE ? OR ${normalizeSql("COALESCE(tags,'')")} LIKE ?)`);
        binds.push(`%${ns}%`, `%${ns}%`, `%${ns}%`, `%${ns}%`);
    }
    if (type) { where.push("type = ?"); binds.push(type); }
    if (difficulty) { where.push("difficulty = ?"); binds.push(difficulty); }
    if (chapter) { where.push("chapter = ?"); binds.push(chapter); }
    if (subjectId) { where.push("subject_id = ?"); binds.push(subjectId); }
    if (favoriteOnly && scope !== "public") { where.push("is_favorite = 1"); }
    if (tag) {
        // tags is stored comma-separated -- wrap both sides in commas so a
        // LIKE match can't false-positive on a substring of a longer tag.
        where.push("((',' || REPLACE(COALESCE(tags,''), ' ', '') || ',') LIKE ?)");
        binds.push(`%,${tag.replace(/\s/g, "")},%`);
    }

    const db = q(env);
    const questions = await db.all(
        `SELECT * FROM questions WHERE ${where.join(" AND ")}
          ORDER BY is_favorite DESC, created_at DESC`,
        ...binds
    );

    // attach options for multiple_choice questions, and whether it's been
    // used in an exam yet (informational only -- editing is always allowed,
    // see onRequestPut)
    const results = [];
    for (const question of questions.results) {
        if (question.type === "multiple_choice") {
            const opts = await db.all(`SELECT * FROM question_options WHERE question_id = ?`, question.id);
            question.options = opts.results;
        }
        const used = await db.first(`SELECT 1 FROM exam_questions WHERE question_id = ?`, question.id);
        question.used_in_exam = !!used;
        results.push(question);
    }
    return ok(results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["type", "text"]);

    const questionId = await createQuestionRecord(env, { schoolId: user.school_id, teacherId: teacher.id, body });

    return created({ id: questionId }, "سؤال ساخته شد");
});

// Editing always creates a new version -- see 018_question_versions.sql
// and _shared/question-versions.js.
export const onRequestPut = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id", "text"]);

    const db = q(env);
    const question = await db.first(
        `SELECT * FROM questions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.id, user.school_id
    );
    if (!question) throw errors.notFound("سؤال پیدا نشد");
    if (question.teacher_id !== teacher.id) throw errors.forbidden("این سؤال متعلق به شما نیست");

    // Editing is always allowed now, even if the question is already used
    // in an exam -- see 018_question_versions.sql. The edit creates a new
    // version; every exam this question was already attached to keeps
    // pointing at its own pinned (old) snapshot via exam_questions.pinned_version,
    // so nothing a student has already seen or answered changes retroactively.

    // type is fixed at creation time -- editing swaps content, not shape.
    const type = question.type;
    if (type === "custom_html") {
        if (!body.custom_html || !body.custom_html.trim()) throw errors.validation("محتوای HTML الزامی است");
        requireMaxLength(body.custom_html, CUSTOM_HTML_MAX_CHARS, "محتوای HTML");
    }
    const meta = readMetadata(body);

    await db.run(
        `UPDATE questions
            SET text = ?, subject_id = ?, correct_boolean = ?, correct_numeric = ?,
                numeric_tolerance = ?, correct_text = ?,
                chapter = ?, topic = ?, explanation = ?, tags = ?, difficulty = ?, grading_mode = ?, custom_html = ?,
                visibility = COALESCE(?, visibility)
          WHERE id = ?`,
        body.text, body.subject_id ?? question.subject_id,
        type === "true_false" ? (body.correct_boolean ? 1 : 0) : null,
        type === "numeric" ? body.correct_numeric : null,
        type === "numeric" ? (body.numeric_tolerance || 0) : null,
        (type === "short_answer" || type === "long_answer" || type === "fill_blank") ? (body.correct_text || null) : null,
        meta.chapter, meta.topic, meta.explanation, meta.tags, meta.difficulty,
        resolveGradingMode(type, body.grading_mode),
        type === "custom_html" ? body.custom_html : null,
        resolveVisibility(body.visibility, question.visibility) ?? null,
        question.id
    );

    if (type === "multiple_choice") {
        if (!Array.isArray(body.options) || body.options.length < 2) {
            throw errors.validation("سؤال چندگزینه‌ای باید حداقل دو گزینه داشته باشد");
        }
        const correctCount = body.options.filter(o => o.is_correct).length;
        if (correctCount !== 1) throw errors.validation("دقیقاً یک گزینه صحیح باید مشخص شود");

        await db.run(`DELETE FROM question_options WHERE question_id = ?`, question.id);
        let correctOptionId = null;
        for (const opt of body.options) {
            const r = await db.run(
                `INSERT INTO question_options (question_id, text, is_correct) VALUES (?, ?, ?)`,
                question.id, opt.text, opt.is_correct ? 1 : 0
            );
            if (opt.is_correct) correctOptionId = r.meta.last_row_id;
        }
        await db.run(`UPDATE questions SET correct_option_id = ? WHERE id = ?`, correctOptionId, question.id);
    }

    // new edit -> new version, frozen from what we just wrote above.
    // Exams already attached (with their own pinned_version) are unaffected.
    await db.run(`UPDATE questions SET version = version + 1 WHERE id = ?`, question.id);
    await snapshotQuestionVersion(env, question.id);

    return ok(null, "سؤال بروزرسانی شد");
});
