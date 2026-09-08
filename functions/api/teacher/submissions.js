// /api/teacher/submissions
// GET  ?assignment_id= -> list submissions for one of this teacher's assignments
// POST { submission_id, score, feedback } -> grade a submission
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, loadAssignmentOwnedByTeacher } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { notifyUsers } from "../_shared/notify.js";
import { writeAudit } from "../_shared/audit.js";
import { syncGradeFromSource } from "../_shared/grades-sync.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignment_id");
    requireFields({ assignment_id: assignmentId }, ["assignment_id"]);
    await loadAssignmentOwnedByTeacher(env, assignmentId, teacher.id, user.school_id);

    const db = q(env);
    const rows = await db.all(
        `SELECT sub.id, sub.student_id, u.full_name as student_name, sub.attempt_number,
                sub.body, sub.answer_data, sub.status, sub.score, sub.feedback,
                sub.submitted_at, sub.graded_at, sub.needs_manual_review
           FROM submissions sub
           JOIN students st ON st.id = sub.student_id
           JOIN users u ON u.id = st.user_id
          WHERE sub.assignment_id = ? AND sub.school_id = ?
          ORDER BY sub.submitted_at DESC`,
        assignmentId, user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "submissions.grade");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["submission_id", "score"]);

    const db = q(env);
    const submission = await db.first(
        `SELECT sub.*, a.teacher_id, a.max_score, a.title as assignment_title, a.subject_id
           FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id
          WHERE sub.id = ? AND sub.school_id = ?`,
        body.submission_id, user.school_id
    );
    if (!submission) throw errors.notFound("پاسخ پیدا نشد");
    if (submission.teacher_id !== teacher.id) throw errors.forbidden("این تکلیف متعلق به شما نیست");

    const score = Number(body.score);
    if (score < 0 || score > submission.max_score) {
        throw errors.validation(`نمره باید بین ۰ تا ${submission.max_score} باشد`);
    }

    await db.run(
        `UPDATE submissions SET score = ?, feedback = ?, status = 'graded', graded_at = datetime('now') WHERE id = ?`,
        score, body.feedback || null, submission.id
    );

    // BUGFIX: this used to only update `submissions` -- the grade never made
    // it into the `grades` table that report cards read from. See grades-sync.js.
    await syncGradeFromSource(env, {
        schoolId: user.school_id, studentId: submission.student_id, subjectId: submission.subject_id,
        teacherId: teacher.id, source: "assignment", sourceId: submission.assignment_id,
        score, maxScore: submission.max_score, feedback: body.feedback || null,
    });

    const student = await db.first(`SELECT user_id FROM students WHERE id = ?`, submission.student_id);
    const parents = await db.all(
        `SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id = ? AND ps.school_id = ?`,
        submission.student_id, user.school_id
    );
    const notifyIds = [student.user_id, ...parents.results.map(r => r.user_id)];
    await notifyUsers(env, user.school_id, notifyIds, "assignment.graded", "تکلیف تصحیح شد", submission.assignment_title);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "submission.grade",
        entityType: "submission", entityId: submission.id,
        meta: { score, assignment_id: submission.assignment_id }, request,
    });

    return ok(null, "نمره ثبت شد");
});
