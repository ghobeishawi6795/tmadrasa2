// POST /api/student/submissions -- submit work for an assignment.
// No R2/blob storage in this project: photo/audio/draw answers are stored as
// base64 directly in D1's `submissions.answer_data` column, so a strict
// server-side size cap is enforced here regardless of anything the client
// already limits. match/drag_drop answers are auto-graded immediately (see
// _shared/interactive.js) instead of waiting for a teacher.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord, loadAssignmentForStudent } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";
import { gradeInteractiveAnswer } from "../_shared/interactive.js";
import { syncGradeFromSource } from "../_shared/grades-sync.js";

const MAX_ANSWER_DATA_CHARS = 500_000; // ~500KB of base64 (~365KB raw binary)
const AUTO_GRADED_TYPES = ["match", "drag_drop"];

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.create");
    const student = await getStudentRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["assignment_id"]);

    const assignment = await loadAssignmentForStudent(env, body.assignment_id, student.id, user.school_id);
    const isAutoGraded = AUTO_GRADED_TYPES.includes(assignment.submission_type);

    if (assignment.submission_type === "text" && !body.body) {
        throw errors.validation("متن پاسخ الزامی است");
    }
    requireMaxLength(body.body, 20000, "متن پاسخ");
    if (["photo", "audio", "draw"].includes(assignment.submission_type) && !body.answer_data) {
        throw errors.validation("فایل پاسخ الزامی است");
    }
    if (body.answer_data && body.answer_data.length > MAX_ANSWER_DATA_CHARS) {
        throw errors.validation(`حجم فایل ارسالی بیش از حد مجاز است (حداکثر ${Math.floor(MAX_ANSWER_DATA_CHARS / 1000)}KB)`);
    }
    if (isAutoGraded) requireFields(body, ["answer_json"]);

    const db = q(env);

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

    let score = null, status = isLate ? "late" : "submitted", needsManualReview = 1, gradedAt = null;
    let answerDataToStore = body.answer_data || null;

    if (isAutoGraded) {
        const result = gradeInteractiveAnswer(assignment, body.answer_json);
        score = result.score;
        status = "graded"; // auto-graded, done immediately regardless of on-time/late
        needsManualReview = 0;
        gradedAt = new Date().toISOString();
        answerDataToStore = JSON.stringify(body.answer_json); // store what the student actually chose, for review
    }

    const insertResult = await db.run(
        `INSERT INTO submissions (school_id, assignment_id, student_id, attempt_number, body, answer_data,
                                   status, score, needs_manual_review, graded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.school_id, assignment.id, student.id, attemptNumber,
        body.body || null, answerDataToStore, status, score, needsManualReview, gradedAt
    );

    if (isAutoGraded) {
        await syncGradeFromSource(env, {
            schoolId: user.school_id, studentId: student.id, subjectId: assignment.subject_id,
            teacherId: assignment.teacher_id, source: "assignment", sourceId: assignment.id,
            score, maxScore: assignment.max_score,
        });
    }

    return created({ id: insertResult.meta.last_row_id, status, score }, isAutoGraded ? "پاسخ ثبت و نمره‌دهی شد" : "پاسخ ارسال شد");
});
