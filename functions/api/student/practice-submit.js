// POST /api/student/practice-submit  { question_id, ...answer }
// Grades ONE question against the live bank row (no exam attempt, no
// version pinning -- practice always reflects whatever the teacher's bank
// currently says) and upserts the student's own result row. Never writes
// to `grades` / `syncGradeFromSource` -- this score never counts.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { getEligibleSubjectIds } from "../_shared/practice.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { normalizeSearchText } from "../_shared/search-normalize.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "practice.use");
    const student = await getStudentRecord(env, user.id, user.school_id);
    const db = q(env);

    const body = await readJson(request);
    requireFields(body, ["question_id"]);

    const question = await db.first(
        `SELECT * FROM questions WHERE id = ? AND school_id = ? AND is_practice = 1 AND deleted_at IS NULL`,
        body.question_id, user.school_id
    );
    if (!question) throw errors.notFound("سؤال تمرینی پیدا نشد");

    const eligible = await getEligibleSubjectIds(env, student.id, user.school_id);
    if (!question.subject_id || !eligible.includes(question.subject_id)) {
        throw errors.forbidden("این سؤال برای کلاس شما نیست");
    }

    let isCorrect = null; // stays null for every manually-graded type below
    let correctOption = null;

    if (question.type === "multiple_choice") {
        correctOption = await db.first(`SELECT id, text FROM question_options WHERE question_id = ? AND is_correct = 1`, question.id);
        isCorrect = correctOption && Number(body.selected_option_id) === correctOption.id ? 1 : 0;
    } else if (question.type === "true_false") {
        isCorrect = typeof body.boolean_answer === "boolean" && body.boolean_answer === !!question.correct_boolean ? 1 : 0;
    } else if (question.type === "numeric") {
        const tol = question.numeric_tolerance || 0;
        const given = Number(body.numeric_answer);
        isCorrect = Number.isFinite(given) && Math.abs(given - question.correct_numeric) <= tol ? 1 : 0;
    } else if (question.type === "fill_blank" && (question.grading_mode || "auto") === "auto") {
        const accepted = (question.correct_text || "").split(",").map(s => normalizeSearchText(s.trim())).filter(Boolean);
        const given = normalizeSearchText((body.text_answer || "").trim());
        isCorrect = given && accepted.includes(given) ? 1 : 0;
    }
    // fill_blank(manual) / short_answer / long_answer / custom_html -> isCorrect stays null,
    // this is just "answered", not graded -- there is no auto right/wrong for these.

    await db.run(
        `INSERT INTO student_practice_results (school_id, student_id, question_id, is_correct, answered_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(student_id, question_id) DO UPDATE SET
           is_correct = excluded.is_correct, answered_at = excluded.answered_at`,
        user.school_id, student.id, question.id, isCorrect
    );

    // Reveal a reference answer now -- safe, the student just answered this
    // themselves and this never reaches a grade.
    const reveal = {};
    // BUGFIX: every other auto-graded type revealed its correct answer here
    // except multiple_choice, which had no branch at all -- the option's
    // own is_correct flag was already being computed above, just never
    // surfaced back to the student.
    if (question.type === "multiple_choice") reveal.correct_option_text = correctOption ? correctOption.text : null;
    else if (question.type === "true_false") reveal.correct_boolean = !!question.correct_boolean;
    else if (question.type === "numeric") reveal.correct_numeric = question.correct_numeric;
    else if (question.correct_text) reveal.correct_text = question.correct_text;

    return ok({ is_correct: isCorrect, explanation: question.explanation || null, ...reveal });
});
