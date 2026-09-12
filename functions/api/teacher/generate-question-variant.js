// POST /api/teacher/generate-question-variant { question_id }
// Always saves the result as a brand-new question (never overwrites the
// original) -- same principle دبستان used: an auto-generated variant needs
// the teacher's own review before it's trusted, so it shouldn't silently
// replace anything.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { generateQuestionVariant, VARIANT_SUPPORTED_TYPES } from "../_shared/question-variant.js";
import { createQuestionRecord } from "./questions.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["question_id"]);

    const db = q(env);
    const question = await db.first(
        `SELECT * FROM questions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.question_id, user.school_id
    );
    if (!question) throw errors.notFound("سؤال پیدا نشد");
    if (question.teacher_id !== teacher.id) throw errors.forbidden("این سؤال متعلق به شما نیست");
    if (!VARIANT_SUPPORTED_TYPES.includes(question.type)) {
        throw errors.validation("تولید خودکار نسخه فقط برای سؤالات «چندگزینه‌ای»، «عددی» و «درست/غلط» پشتیبانی می‌شود");
    }

    let options = [];
    if (question.type === "multiple_choice") {
        const opts = await db.all(`SELECT * FROM question_options WHERE question_id = ? ORDER BY id ASC`, question.id);
        options = opts.results;
    }

    const result = generateQuestionVariant(question, options);
    if (!result.ok) throw errors.validation(result.reason);

    const newBody = {
        type: question.type,
        text: result.patch.text,
        subject_id: question.subject_id,
        chapter: question.chapter, topic: question.topic, tags: question.tags, difficulty: question.difficulty,
        explanation: question.explanation,
        correct_boolean: result.patch.correct_boolean,
        correct_numeric: result.patch.correct_numeric,
        numeric_tolerance: result.patch.numeric_tolerance,
        options: result.patch.options,
    };

    const newId = await createQuestionRecord(env, { schoolId: user.school_id, teacherId: teacher.id, body: newBody });
    return created({ id: newId }, "نسخهٔ خودکار ساخته شد");
});
