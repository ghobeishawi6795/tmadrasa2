// /api/teacher/chapters -- a "فصل" (chapter) as a real, manageable thing:
// name + description, creatable empty (before any question exists), instead
// of only ever appearing implicitly once a question used that chapter text.
// questions.chapter stays a plain TEXT column (no FK) -- see migration
// 026_chapters.sql for why -- so this file is also responsible for keeping
// that text in sync with this table (upsertChapterFromText, called from
// questions.js/import-html.js) and for cascading a rename onto it.
//
// GET    -> list chapters for one subject (merges this table with any
//           legacy chapter text still used by questions but not yet
//           promoted into a row here -- old data never needs a backfill)
// POST   -> create (or update the description of an already-existing) chapter
// PUT    -> rename / edit description -- rename cascades onto questions.chapter
// DELETE -> remove the managed row only; a chapter still in use by questions
//           reappears via the legacy-fallback merge in GET (nothing orphaned)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, assertSubjectInSchool } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";

// Shared with questions.js/import-html.js -- call after a question is saved
// with a non-empty chapter, so a chapter typed directly on a question (the
// old way) still ends up as a real row here (with position appended at the
// end, no description yet) instead of only ever existing as loose text.
export async function upsertChapterFromText(env, { schoolId, teacherId, subjectId, chapterName }) {
    if (!chapterName || !subjectId) return;
    const db = q(env);
    const existing = await db.first(
        `SELECT id FROM chapters WHERE teacher_id = ? AND school_id = ? AND subject_id = ? AND name = ?`,
        teacherId, schoolId, subjectId, chapterName
    );
    if (existing) return;
    const maxPos = await db.first(`SELECT COALESCE(MAX(position), -1) as m FROM chapters WHERE teacher_id = ? AND school_id = ? AND subject_id = ?`, teacherId, schoolId, subjectId);
    await db.run(
        `INSERT INTO chapters (school_id, teacher_id, subject_id, name, position) VALUES (?, ?, ?, ?, ?)`,
        schoolId, teacherId, subjectId, chapterName, (maxPos?.m ?? -1) + 1
    );
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);

    const url = new URL(request.url);
    const subjectId = url.searchParams.get("subject_id");
    if (!subjectId) throw errors.validation("subject_id لازم است");

    const db = q(env);
    const managed = await db.all(
        `SELECT c.*, (SELECT COUNT(*) FROM questions q WHERE q.teacher_id = c.teacher_id AND q.school_id = c.school_id AND q.subject_id = c.subject_id AND q.chapter = c.name AND q.deleted_at IS NULL) as question_count
           FROM chapters c WHERE c.teacher_id = ? AND c.school_id = ? AND c.subject_id = ?
          ORDER BY c.position, c.id`,
        teacher.id, user.school_id, subjectId
    );
    const managedNames = new Set(managed.results.map(c => c.name));

    // legacy fallback: any chapter text still sitting on a question but never
    // promoted into this table (data from before this table existed, or a
    // stray edge case) -- shown the same way, just without a description/id.
    const legacyRows = await db.all(
        `SELECT DISTINCT chapter FROM questions WHERE teacher_id = ? AND school_id = ? AND subject_id = ? AND chapter IS NOT NULL AND chapter != '' AND deleted_at IS NULL`,
        teacher.id, user.school_id, subjectId
    );
    const legacy = legacyRows.results
        .map(r => r.chapter)
        .filter(name => !managedNames.has(name))
        .sort()
        .map(name => ({ id: null, name, description: null, question_count: null }));

    return ok([...managed.results, ...legacy]);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);

    const body = await readJson(request);
    requireFields(body, ["subject_id", "name"]);
    const name = String(body.name).trim();
    if (!name) throw errors.validation("نام فصل نمی‌تواند خالی باشد");
    requireMaxLength(name, 200, "نام فصل");
    requireMaxLength(body.description, 2000, "توضیحات فصل");
    await assertSubjectInSchool(env, body.subject_id, user.school_id);

    const db = q(env);
    const existing = await db.first(
        `SELECT id FROM chapters WHERE teacher_id = ? AND school_id = ? AND subject_id = ? AND name = ?`,
        teacher.id, user.school_id, body.subject_id, name
    );
    if (existing) {
        // creating a chapter that already exists is treated as "just update
        // its description" rather than a conflict error -- friendlier for a
        // teacher who forgot they'd already made this tab.
        if (body.description !== undefined) {
            await db.run(`UPDATE chapters SET description = ? WHERE id = ?`, body.description || null, existing.id);
        }
        return ok({ id: existing.id }, "این فصل از قبل وجود داشت — توضیحات به‌روزرسانی شد");
    }

    const maxPos = await db.first(`SELECT COALESCE(MAX(position), -1) as m FROM chapters WHERE teacher_id = ? AND school_id = ? AND subject_id = ?`, teacher.id, user.school_id, body.subject_id);
    const result = await db.run(
        `INSERT INTO chapters (school_id, teacher_id, subject_id, name, description, position) VALUES (?, ?, ?, ?, ?, ?)`,
        user.school_id, teacher.id, body.subject_id, name, body.description || null, (maxPos?.m ?? -1) + 1
    );
    return created({ id: result.meta.last_row_id }, "فصل ساخته شد");
});

export const onRequestPut = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.update");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);

    const body = await readJson(request);
    requireFields(body, ["id"]);
    const db = q(env);
    const chapter = await db.first(`SELECT * FROM chapters WHERE id = ? AND teacher_id = ? AND school_id = ?`, body.id, teacher.id, user.school_id);
    if (!chapter) throw errors.notFound("فصل پیدا نشد");
    if (Number(chapter.school_id) !== Number(user.school_id)) throw errors.forbidden("این فصل متعلق به مدرسه شما نیست");

    let newName = chapter.name;
    if (body.name !== undefined) {
        newName = String(body.name).trim();
        if (!newName) throw errors.validation("نام فصل نمی‌تواند خالی باشد");
        requireMaxLength(newName, 200, "نام فصل");
    }
    if (body.description !== undefined) requireMaxLength(body.description, 2000, "توضیحات فصل");

    if (newName !== chapter.name) {
        const clash = await db.first(
            `SELECT id FROM chapters WHERE teacher_id = ? AND school_id = ? AND subject_id = ? AND name = ? AND id != ?`,
            teacher.id, user.school_id, chapter.subject_id, newName, chapter.id
        );
        if (clash) throw errors.validation("فصلی با این نام از قبل وجود دارد");
    }

    await db.run(
        `UPDATE chapters SET name = ?, description = ? WHERE id = ?`,
        newName, body.description !== undefined ? (body.description || null) : chapter.description, chapter.id
    );
    if (newName !== chapter.name) {
        // keep every existing question's plain-text chapter field in sync --
        // this text-based join (not an FK) is exactly why a rename needs this
        // explicit cascade instead of happening for free.
        await db.run(
            `UPDATE questions SET chapter = ? WHERE teacher_id = ? AND school_id = ? AND subject_id = ? AND chapter = ?`,
            newName, teacher.id, user.school_id, chapter.subject_id, chapter.name
        );
    }
    return ok(null, "فصل به‌روزرسانی شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.delete");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);

    const body = await readJson(request);
    requireFields(body, ["id"]);
    const db = q(env);
    const chapter = await db.first(`SELECT id FROM chapters WHERE id = ? AND teacher_id = ? AND school_id = ?`, body.id, teacher.id, user.school_id);
    if (!chapter) throw errors.notFound("فصل پیدا نشد");
    await db.run(`DELETE FROM chapters WHERE id = ?`, chapter.id);
    return ok(null, "فصل حذف شد (سؤال‌هایی که قبلاً با این فصل ثبت شده‌اند دست‌نخورده می‌مانند)");
});
