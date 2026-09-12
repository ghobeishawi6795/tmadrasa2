// POST /api/teacher/copy-public-question { question_id }
// Copies an approved-public question (from any teacher in the same school)
// into the caller's own bank as a brand-new, independently-owned question --
// never a reference/link. Same "always a fresh copy" principle as the
// template packs and the variant generator: the copy is immediately
// editable/deletable by its new owner with zero effect on the original.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { createQuestionRecord } from "./questions.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["question_id"]);

    const db = q(env);
    const source = await db.first(
        `SELECT * FROM questions WHERE id = ? AND school_id = ? AND visibility = 'public' AND deleted_at IS NULL`,
        body.question_id, user.school_id
    );
    if (!source) throw errors.notFound("سؤال پیدا نشد یا عمومی نیست");

    let options;
    if (source.type === "multiple_choice") {
        const opts = await db.all(`SELECT * FROM question_options WHERE question_id = ? ORDER BY id ASC`, source.id);
        options = opts.results.map(o => ({ text: o.text, is_correct: !!o.is_correct }));
    }

    const newId = await createQuestionRecord(env, {
        schoolId: user.school_id, teacherId: teacher.id,
        body: {
            type: source.type, text: source.text, subject_id: source.subject_id,
            chapter: source.chapter, topic: source.topic, tags: source.tags, difficulty: source.difficulty,
            explanation: source.explanation, correct_boolean: source.correct_boolean,
            correct_numeric: source.correct_numeric, numeric_tolerance: source.numeric_tolerance,
            correct_text: source.correct_text, grading_mode: source.grading_mode,
            custom_html: source.custom_html, options,
            // the copy starts private -- copying a public question doesn't
            // make YOUR copy public too, that'd bypass moderation entirely.
            visibility: "private",
        },
    });

    return created({ id: newId }, "سؤال به بانک شما کپی شد");
});
