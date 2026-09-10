// /api/teacher/questions  -- question bank, independent of any single exam
// GET  -> list this teacher's questions
// POST -> create a question (with options for multiple_choice)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";

const VALID_TYPES = ["multiple_choice", "true_false", "numeric", "short_answer", "long_answer"];

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const db = q(env);
    const questions = await db.all(
        `SELECT * FROM questions WHERE teacher_id = ? AND school_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        teacher.id, user.school_id
    );

    // attach options for multiple_choice questions, and whether it's locked
    // (already attached to an exam, so no longer editable)
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
    if (!VALID_TYPES.includes(body.type)) throw errors.validation("نوع سؤال نامعتبر است");

    const db = q(env);

    const result = await db.run(
        `INSERT INTO questions (school_id, teacher_id, subject_id, type, text,
                                 correct_boolean, correct_numeric, numeric_tolerance, correct_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.school_id, teacher.id, body.subject_id || null, body.type, body.text,
        body.type === "true_false" ? (body.correct_boolean ? 1 : 0) : null,
        body.type === "numeric" ? body.correct_numeric : null,
        body.type === "numeric" ? (body.numeric_tolerance || 0) : null,
        (body.type === "short_answer" || body.type === "long_answer") ? (body.correct_text || null) : null
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

    return created({ id: questionId }, "سؤال ساخته شد");
});

// Only allowed while the question hasn't been attached to any exam yet --
// once it's on an exam, editing it could retroactively change something a
// student already answered/was graded against.
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

    const usedInExam = await db.first(`SELECT 1 FROM exam_questions WHERE question_id = ?`, question.id);
    if (usedInExam) throw errors.forbidden("این سؤال قبلاً به یک آزمون اضافه شده و دیگر قابل ویرایش نیست");

    // type is fixed at creation time -- editing swaps content, not shape.
    const type = question.type;

    await db.run(
        `UPDATE questions
            SET text = ?, subject_id = ?, correct_boolean = ?, correct_numeric = ?,
                numeric_tolerance = ?, correct_text = ?
          WHERE id = ?`,
        body.text, body.subject_id ?? question.subject_id,
        type === "true_false" ? (body.correct_boolean ? 1 : 0) : null,
        type === "numeric" ? body.correct_numeric : null,
        type === "numeric" ? (body.numeric_tolerance || 0) : null,
        (type === "short_answer" || type === "long_answer") ? (body.correct_text || null) : null,
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

    return ok(null, "سؤال بروزرسانی شد");
});
