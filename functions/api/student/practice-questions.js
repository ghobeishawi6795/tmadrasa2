// GET /api/student/practice-questions?subject_id=&chapter=
// subject_id omitted -> "همه‌ی درس‌ها" tab: every is_practice question
// across every subject taught to this student's class (chapter sub-tabs
// don't apply here, mirroring the teacher bank's own "select a subject to
// see chapters" behavior).
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { getEligibleSubjectIds } from "../_shared/practice.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

// Strips whatever would leak the correct answer -- UNLESS the student has
// already answered this question before (spr present), in which case
// showing the answer key back to them is just reviewing their own past
// practice, not a leak. This mirrors the exam-result page revealing
// answers only once an attempt is already submitted.
function toSafeQuestion(question, options, priorResult) {
    const answered = !!priorResult;
    const base = {
        id: question.id,
        type: question.type,
        text: question.text,
        subject_id: question.subject_id,
        chapter: question.chapter,
        difficulty: question.difficulty,
        custom_html: question.type === "custom_html" ? question.custom_html : undefined,
        already_answered: answered ? { is_correct: priorResult.is_correct, answered_at: priorResult.answered_at } : null,
        explanation: answered ? (question.explanation || null) : undefined,
    };

    if (question.type === "multiple_choice") {
        base.options = options.map(o => ({ id: o.id, text: o.text, is_correct: answered ? !!o.is_correct : undefined }));
    } else if (answered) {
        // reveal a reference answer now that the student already tried it
        if (question.type === "true_false") base.correct_boolean = !!question.correct_boolean;
        else if (question.type === "numeric") { base.correct_numeric = question.correct_numeric; base.numeric_tolerance = question.numeric_tolerance; }
        else if (question.correct_text) base.correct_text = question.correct_text; // fill_blank + short/long answer reference text
    }
    return base;
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "practice.use");
    const student = await getStudentRecord(env, user.id);
    const db = q(env);

    const url = new URL(request.url);
    const subjectId = url.searchParams.get("subject_id");
    const chapter = url.searchParams.get("chapter");

    const eligible = await getEligibleSubjectIds(env, student.id, user.school_id);
    if (subjectId && !eligible.includes(Number(subjectId))) {
        throw errors.forbidden("این درس برای کلاس شما نیست");
    }
    if (!eligible.length) return ok({ chapters: [], questions: [] });

    const where = ["school_id = ?", "is_practice = 1", "deleted_at IS NULL"];
    const binds = [user.school_id];
    if (subjectId) {
        where.push("subject_id = ?");
        binds.push(subjectId);
    } else {
        where.push(`subject_id IN (${eligible.map(() => "?").join(",")})`);
        binds.push(...eligible);
    }

    // chapter sub-tabs (only meaningful within one selected subject) --
    // computed unfiltered-by-chapter so the tab bar itself doesn't
    // disappear once a chapter filter narrows the question list below.
    let chapters = [];
    if (subjectId) {
        const chapterRows = await db.all(
            `SELECT DISTINCT chapter FROM questions WHERE ${where.join(" AND ")} AND chapter IS NOT NULL`,
            ...binds
        );
        chapters = chapterRows.results.map(r => r.chapter).sort();
    }

    if (chapter) { where.push("chapter = ?"); binds.push(chapter); }

    const questions = await db.all(
        `SELECT * FROM questions WHERE ${where.join(" AND ")} ORDER BY created_at DESC`,
        ...binds
    );

    const priorResults = await db.all(
        `SELECT question_id, is_correct, answered_at FROM student_practice_results WHERE student_id = ?`,
        student.id
    );
    const priorByQ = Object.fromEntries(priorResults.results.map(r => [r.question_id, r]));

    const multipleChoiceIds = questions.results.filter(qr => qr.type === "multiple_choice").map(qr => qr.id);
    const optionsByQuestion = new Map();
    if (multipleChoiceIds.length) {
        const opts = await db.all(`SELECT * FROM question_options WHERE question_id IN (${multipleChoiceIds.map(() => "?").join(",")})`, ...multipleChoiceIds);
        for (const o of opts.results) {
            if (!optionsByQuestion.has(o.question_id)) optionsByQuestion.set(o.question_id, []);
            optionsByQuestion.get(o.question_id).push(o);
        }
    }
    const safeQuestions = questions.results.map(question => toSafeQuestion(question, optionsByQuestion.get(question.id) || [], priorByQ[question.id]));

    return ok({ chapters, questions: safeQuestions });
});
