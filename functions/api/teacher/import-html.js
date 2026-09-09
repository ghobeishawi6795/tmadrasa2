// POST /api/teacher/import-html
// Bulk-imports questions (exam bank) and/or assignments from the fixed
// HTML template (see docs/راهنمای-وارد-کردن-html.md). Never fails the whole
// batch for one bad block -- each item is validated and inserted
// independently, with a per-item reason reported back for anything skipped.
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

    const items = parseImportHtml(body.html);
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

    for (const item of items) {
        if (item.error) { skipped.push({ index: item.index, reason: item.error }); continue; }

        const subjectId = subjectByName.get(item.subjectName);
        if (!subjectId) {
            skipped.push({ index: item.index, reason: `درسی به نام «${item.subjectName}» پیدا نشد (باید دقیقاً با نام یکی از دروس مدرسه یکی باشد)` });
            continue;
        }

        try {
            if (item.target === "exam") {
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
            } else {
                if (!assignPermChecked) { await requirePermission(env, user, "assignments.create"); assignPermChecked = true; }
                await assertTeacherTeachesSubjectInClass(env, teacher.id, body.class_id, subjectId, user.school_id);

                let questionPayload = null;
                if (item.submission_type === "match" || item.submission_type === "drag_drop") {
                    questionPayload = JSON.stringify(buildQuestionPayload(item.submission_type, item.question_payload));
                }
                const dueAt = new Date(Date.now() + item.dueDays * 86400000).toISOString();

                await db.run(
                    `INSERT INTO assignments (school_id, class_id, subject_id, teacher_id, title, description,
                                               due_at, allow_late, max_attempts, max_score, submission_type, question_payload)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    user.school_id, body.class_id, subjectId, teacher.id, item.title,
                    item.description || null, dueAt, 1, 1, 20, item.submission_type, questionPayload
                );
                imported++;
            }
        } catch (e) {
            if (e instanceof Response) {
                skipped.push({ index: item.index, reason: "بدون دسترسی یا مالکیت لازم روی این کلاس/درس" });
            } else {
                skipped.push({ index: item.index, reason: "خطای نامشخص هنگام ثبت (احتمالاً ساختار داخلی نامعتبر)" });
            }
        }
    }

    const message = `${imported} مورد اضافه شد` + (skipped.length ? `، ${skipped.length} مورد رد شد` : "");
    return ok({ imported, skipped }, message);
});
