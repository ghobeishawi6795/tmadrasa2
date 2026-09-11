// POST /api/teacher/import-html
// Bulk-imports questions (exam bank) and/or an assignment from the fixed
// HTML template (see docs/راهنمای-وارد-کردن-html.md). Never fails the whole
// batch for one bad block -- each item is validated independently, with a
// per-item reason reported back for anything skipped.
//
// Assignment-target blocks are bundled: if the file has more than one, they
// all become sub-questions of ONE multi-question assignment (one thing the
// student opens, with the questions inside, one after another) instead of a
// separate assignment per block. A file with exactly one assignment-target
// block still creates a plain single-question assignment, unchanged from
// before. All assignment blocks in one file must share the same subject
// (data-subject) -- the assignment row itself only has one subject_id -- so
// a mismatched block is skipped with a clear reason rather than silently
// merged in.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, assertClassOwnedByTeacher, assertTeacherTeachesSubjectInClass } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, requireMaxLength, withErrorHandling } from "../_shared/validate.js";
import { buildQuestionPayload } from "../_shared/interactive.js";
import { parseImportHtml } from "../_shared/html-import.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["html"]);
    requireMaxLength(body.html, 300000, "فایل HTML");

    const { items, styleBlock } = parseImportHtml(body.html);
    if (items.length === 0) {
        throw errors.validation("هیچ بلوک «question» با ساختار درست تو فایل پیدا نشد");
    }

    const needsClass = items.some(i => !i.error && i.target === "assignment");
    if (needsClass) {
        requireFields(body, ["class_id"]);
        await assertClassOwnedByTeacher(env, body.class_id, teacher.id, user.school_id);
    }

    const db = q(env);
    const subjectRows = await db.all(`SELECT id, name FROM subjects WHERE school_id = ?`, user.school_id);
    const subjectByName = new Map(subjectRows.results.map(s => [s.name.trim(), s.id]));

    let examPermChecked = false;
    let assignPermChecked = false;
    const skipped = [];
    let imported = 0;
    let bundleInfo = null; // { title, questionCount } when a multi-question assignment was created

    // -- exam bank items: unchanged, one `questions` row each --
    for (const item of items.filter(i => i.target === "exam")) {
        if (item.error) { skipped.push({ index: item.index, reason: item.error }); continue; }

        const subjectId = subjectByName.get(item.subjectName);
        if (!subjectId) {
            skipped.push({ index: item.index, reason: `درسی به نام «${item.subjectName}» پیدا نشد (باید دقیقاً با نام یکی از دروس مدرسه یکی باشد)` });
            continue;
        }

        try {
            if (!examPermChecked) { await requirePermission(env, user, "questions.create"); examPermChecked = true; }

            const r = await db.run(
                `INSERT INTO questions (school_id, teacher_id, subject_id, type, text,
                                         correct_boolean, correct_numeric, numeric_tolerance, correct_text)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                user.school_id, teacher.id, subjectId, item.type, item.text,
                item.type === "true_false" ? (item.correct_boolean ? 1 : 0) : null,
                item.type === "numeric" ? item.correct_numeric : null,
                item.type === "numeric" ? 0 : null,
                (item.type === "short_answer" || item.type === "long_answer") ? (item.correct_text || null) : null
            );
            const questionId = r.meta.last_row_id;

            if (item.type === "multiple_choice") {
                let correctOptionId = null;
                for (const opt of item.options) {
                    const or_ = await db.run(
                        `INSERT INTO question_options (question_id, text, is_correct) VALUES (?, ?, ?)`,
                        questionId, opt.text, opt.is_correct ? 1 : 0
                    );
                    if (opt.is_correct) correctOptionId = or_.meta.last_row_id;
                }
                await db.run(`UPDATE questions SET correct_option_id = ? WHERE id = ?`, correctOptionId, questionId);
            }
            imported++;
        } catch (e) {
            skipped.push({ index: item.index, reason: "خطای نامشخص هنگام ثبت (احتمالاً ساختار داخلی نامعتبر)" });
        }
    }

    // -- assignment items: resolve subject for each valid one first --
    const resolved = [];
    for (const item of items.filter(i => i.target === "assignment")) {
        if (item.error) { skipped.push({ index: item.index, reason: item.error }); continue; }
        const subjectId = subjectByName.get(item.subjectName);
        if (!subjectId) {
            skipped.push({ index: item.index, reason: `درسی به نام «${item.subjectName}» پیدا نشد (باید دقیقاً با نام یکی از دروس مدرسه یکی باشد)` });
            continue;
        }
        resolved.push({ ...item, subjectId });
    }

    if (resolved.length === 1) {
        // legacy path: exactly one assignment block -> one plain single-question assignment
        const item = resolved[0];
        try {
            if (!assignPermChecked) { await requirePermission(env, user, "assignments.create"); assignPermChecked = true; }
            await assertTeacherTeachesSubjectInClass(env, teacher.id, body.class_id, item.subjectId, user.school_id);

            let questionPayload = null;
            if (item.submission_type === "match" || item.submission_type === "drag_drop") {
                questionPayload = JSON.stringify(buildQuestionPayload(item.submission_type, item.question_payload));
            }
            const dueAt = new Date(Date.now() + item.dueDays * 86400000).toISOString();

            await db.run(
                `INSERT INTO assignments (school_id, class_id, subject_id, teacher_id, title, description,
                                           due_at, allow_late, max_attempts, max_score, submission_type, question_payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                user.school_id, body.class_id, item.subjectId, teacher.id, item.title,
                item.description || null, dueAt, 1, 1, 20, item.submission_type, questionPayload
            );
            imported++;
        } catch (e) {
            skipped.push({ index: item.index, reason: e instanceof Response ? "بدون دسترسی یا مالکیت لازم روی این کلاس/درس" : "خطای نامشخص هنگام ثبت تکلیف" });
        }
    } else if (resolved.length > 1) {
        // bundle: all must share the subject of the first resolved item
        const canonicalSubjectId = resolved[0].subjectId;
        const canonicalSubjectName = resolved[0].subjectName;
        const bundleItems = [];
        for (const item of resolved) {
            if (item.subjectId !== canonicalSubjectId) {
                skipped.push({ index: item.index, reason: `درس این سؤال با درس اولین سؤالِ تکلیف («${canonicalSubjectName}») یکی نیست؛ همه‌ی سؤال‌های یک تکلیف باید هم‌درس باشند` });
                continue;
            }
            bundleItems.push(item);
        }

        if (bundleItems.length > 0) {
            try {
                if (!assignPermChecked) { await requirePermission(env, user, "assignments.create"); assignPermChecked = true; }
                await assertTeacherTeachesSubjectInClass(env, teacher.id, body.class_id, canonicalSubjectId, user.school_id);

                const first = bundleItems[0];
                const dueAt = new Date(Date.now() + first.dueDays * 86400000).toISOString();

                const assignResult = await db.run(
                    `INSERT INTO assignments (school_id, class_id, subject_id, teacher_id, title, description,
                                               due_at, allow_late, max_attempts, max_score, submission_type, question_payload,
                                               is_multi_question, prompt_style)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 20, NULL, NULL, 1, ?)`,
                    user.school_id, body.class_id, canonicalSubjectId, teacher.id, first.title,
                    first.description || null, dueAt, styleBlock
                );
                const assignmentId = assignResult.meta.last_row_id;

                let orderIndex = 0;
                for (const item of bundleItems) {
                    let questionPayload = null;
                    if (item.submission_type === "match" || item.submission_type === "drag_drop") {
                        questionPayload = JSON.stringify(buildQuestionPayload(item.submission_type, item.question_payload));
                    }
                    await db.run(
                        `INSERT INTO assignment_questions
                            (assignment_id, order_index, submission_type, question_payload, prompt_html, prompt_text, weight)
                         VALUES (?, ?, ?, ?, ?, ?, 1)`,
                        assignmentId, orderIndex++, item.submission_type, questionPayload,
                        item.blockHtml || null, item.description || null
                    );
                    imported++;
                }
                bundleInfo = { title: first.title, questionCount: bundleItems.length };
            } catch (e) {
                for (const item of bundleItems) {
                    skipped.push({ index: item.index, reason: e instanceof Response ? "بدون دسترسی یا مالکیت لازم روی این کلاس/درس" : "خطای نامشخص هنگام ثبت تکلیف چندسؤالی" });
                }
            }
        }
    }

    let message = `${imported} مورد اضافه شد` + (skipped.length ? `، ${skipped.length} مورد رد شد` : "");
    if (bundleInfo) message += ` — «${bundleInfo.title}» به‌صورت یک تکلیف با ${bundleInfo.questionCount} سؤال ثبت شد`;
    return ok({ imported, skipped, bundle: bundleInfo }, message);
});
