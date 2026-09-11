// POST /api/student/multi-submissions
// Submits answers for every question of a multi-question assignment in one
// call. Mirrors the single-question flow in student/submissions.js, but
// scores/stores one row per sub-question in `submission_answers`.
// Auto-graded types (match/drag_drop) are scored immediately per question
// using the same _shared/interactive.js logic as single-question
// assignments; everything else waits for the teacher (see
// teacher/submission-answers.js). The overall submission is only marked
// "graded" (with a final score synced into `grades`) once every question
// that needs manual review has been graded.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord, loadAssignmentForStudent } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";
import { gradeInteractiveAnswer } from "../_shared/interactive.js";
import { syncGradeFromSource } from "../_shared/grades-sync.js";

const MAX_ANSWER_DATA_CHARS = 500_000; // ~500KB of base64, same cap as the single-question flow
const AUTO_GRADED_TYPES = ["match", "drag_drop"];

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.create");
    const student = await getStudentRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["assignment_id", "answers"]);
    if (!Array.isArray(body.answers) || body.answers.length === 0) {
        throw errors.validation("پاسخ‌ها الزامی است");
    }

    const assignment = await loadAssignmentForStudent(env, body.assignment_id, student.id, user.school_id);
    if (!assignment.is_multi_question) throw errors.validation("این تکلیف چندسؤالی نیست");

    const db = q(env);
    const questionRows = await db.all(
        `SELECT * FROM assignment_questions WHERE assignment_id = ?`, assignment.id
    );
    const questionsById = new Map(questionRows.results.map(qr => [qr.id, qr]));
    if (body.answers.length !== questionRows.results.length) {
        throw errors.validation("پاسخ همه‌ی سؤال‌ها الزامی است");
    }

    const existing = await db.first(
        `SELECT COUNT(*) as c FROM submissions WHERE assignment_id = ? AND student_id = ?`,
        assignment.id, student.id
    );
    const attemptNumber = existing.c + 1;
    if (attemptNumber > assignment.max_attempts) {
        throw errors.forbidden("تعداد مجاز ارسال این تکلیف تمام شده است");
    }

    const isLate = new Date() > new Date(assignment.due_at);
    if (isLate && !assignment.allow_late) {
        throw errors.forbidden("مهلت ارسال این تکلیف گذشته است");
    }

    // validate + auto-grade every answer up-front so a bad answer never
    // leaves a half-written submission behind
    const prepared = [];
    for (const ans of body.answers) {
        const qr = questionsById.get(Number(ans.assignment_question_id));
        if (!qr) throw errors.validation("یک یا چند سؤال به این تکلیف تعلق ندارد");

        const maxScore = qr.weight || 1;
        let answerData = null, score = null, needsManualReview = 1;

        if (AUTO_GRADED_TYPES.includes(qr.submission_type)) {
            if (!ans.answer_json) throw errors.validation("پاسخ یکی از سؤال‌ها ناقص است");
            const result = gradeInteractiveAnswer(
                { submission_type: qr.submission_type, question_payload: qr.question_payload, max_score: maxScore },
                ans.answer_json
            );
            score = result.score;
            needsManualReview = 0;
            answerData = JSON.stringify(ans.answer_json);
        } else if (qr.submission_type === "text") {
            if (!ans.body) throw errors.validation("متن پاسخ برای یکی از سؤال‌ها الزامی است");
            requireMaxLength(ans.body, 20000, "متن پاسخ");
            answerData = ans.body;
        } else {
            if (!ans.answer_data) throw errors.validation("فایل پاسخ برای یکی از سؤال‌ها الزامی است");
            if (ans.answer_data.length > MAX_ANSWER_DATA_CHARS) {
                throw errors.validation(`حجم فایل ارسالی یکی از سؤال‌ها بیش از حد مجاز است (حداکثر ${Math.floor(MAX_ANSWER_DATA_CHARS / 1000)}KB)`);
            }
            answerData = ans.answer_data;
        }
        prepared.push({ questionId: qr.id, answerData, score, needsManualReview, maxScore });
    }

    const anyPending = prepared.some(p => p.needsManualReview);
    const autoTotal = prepared.reduce((sum, p) => sum + (p.score || 0), 0);
    const totalWeight = prepared.reduce((sum, p) => sum + (p.maxScore || 1), 0);

    const status = anyPending ? (isLate ? "late" : "submitted") : "graded";
    const finalScore = anyPending ? null : Math.round((autoTotal / totalWeight) * assignment.max_score * 100) / 100;
    const gradedAt = anyPending ? null : new Date().toISOString();

    const subResult = await db.run(
        `INSERT INTO submissions (school_id, assignment_id, student_id, attempt_number,
                                   status, score, needs_manual_review, graded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        user.school_id, assignment.id, student.id, attemptNumber,
        status, finalScore, anyPending ? 1 : 0, gradedAt
    );
    const submissionId = subResult.meta.last_row_id;

    for (const p of prepared) {
        await db.run(
            `INSERT INTO submission_answers
                (submission_id, assignment_question_id, answer_data, score, max_score, needs_manual_review, graded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            submissionId, p.questionId, p.answerData, p.score, p.maxScore, p.needsManualReview,
            p.needsManualReview ? null : new Date().toISOString()
        );
    }

    if (!anyPending) {
        await syncGradeFromSource(env, {
            schoolId: user.school_id, studentId: student.id, subjectId: assignment.subject_id,
            teacherId: assignment.teacher_id, source: "assignment", sourceId: assignment.id,
            score: finalScore, maxScore: assignment.max_score,
        });
    }

    return created(
        { id: submissionId, status, score: finalScore },
        anyPending ? "پاسخ‌ها ارسال شد" : "پاسخ‌ها ثبت و نمره‌دهی شد"
    );
});
