// /api/teacher/assignments
// GET    -> list this teacher's assignments
// POST   -> create assignment
// DELETE -> soft delete
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import {
    getTeacherRecord, assertClassOwnedByTeacher, assertTeacherTeachesSubjectInClass,
    loadAssignmentOwnedByTeacher,
} from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { notifyUsers, getClassUserIds } from "../_shared/notify.js";
import { writeAudit } from "../_shared/audit.js";
import { buildQuestionPayload } from "../_shared/interactive.js";

const SUBMISSION_TYPES = ["text", "photo", "audio", "draw", "match", "drag_drop"];
const AUTO_GRADED_TYPES = ["match", "drag_drop"];

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.view");
    const teacher = await getTeacherRecord(env, user.id);

    const db = q(env);
    const rows = await db.all(
        `SELECT a.*, c.name as class_name, s.name as subject_name, ch.name as chapter_name,
                (SELECT COUNT(*) FROM submissions sub WHERE sub.assignment_id = a.id) as submission_count,
                (SELECT COUNT(*) FROM assignment_questions aq WHERE aq.assignment_id = a.id) as question_count
           FROM assignments a
           JOIN classes c ON c.id = a.class_id
           JOIN subjects s ON s.id = a.subject_id
           LEFT JOIN chapters ch ON ch.id = a.chapter_id
          WHERE a.teacher_id = ? AND a.school_id = ? AND a.deleted_at IS NULL
          ORDER BY a.due_at DESC`,
        teacher.id, user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["class_id", "subject_id", "title", "due_at"]);

    const submissionType = body.submission_type || "text";
    if (!SUBMISSION_TYPES.includes(submissionType)) throw errors.validation(`نوع پاسخ باید یکی از ${SUBMISSION_TYPES.join("/")} باشد`);
    const maxAttempts = Number(body.max_attempts ?? 1);
    const maxScore = Number(body.max_score ?? 20);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw errors.validation("max_attempts باید عدد صحیح مثبت باشد");
    if (!Number.isFinite(maxScore) || maxScore <= 0) throw errors.validation("max_score باید عدد مثبت باشد");
    const dueAt = new Date(body.due_at);
    if (Number.isNaN(dueAt.getTime())) throw errors.validation("تاریخ مهلت تکلیف نامعتبر است");

    let questionPayload = null;
    if (AUTO_GRADED_TYPES.includes(submissionType)) {
        requireFields(body, ["question_payload"]);
        questionPayload = JSON.stringify(buildQuestionPayload(submissionType, body.question_payload));
    }

    await assertClassOwnedByTeacher(env, body.class_id, teacher.id, user.school_id);
    await assertTeacherTeachesSubjectInClass(env, teacher.id, body.class_id, body.subject_id, user.school_id);

    const db = q(env);

    let chapterId = null;
    if (body.chapter_id) {
        const chapter = await db.first(
            `SELECT id FROM chapters WHERE id = ? AND teacher_id = ? AND subject_id = ?`,
            body.chapter_id, teacher.id, body.subject_id
        );
        if (!chapter) throw errors.validation("فصل انتخاب‌شده معتبر نیست");
        chapterId = chapter.id;
    }

    const result = await db.run(
        `INSERT INTO assignments (school_id, class_id, subject_id, teacher_id, title, description,
                                   due_at, allow_late, max_attempts, max_score, submission_type, question_payload, chapter_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.school_id, body.class_id, body.subject_id, teacher.id, body.title,
        body.description || null, dueAt.toISOString(), body.allow_late ? 1 : 0,
        maxAttempts, maxScore, submissionType, questionPayload, chapterId
    );
    const assignmentId = result.meta.last_row_id;

    const { studentUserIds } = await getClassUserIds(env, body.class_id);
    await notifyUsers(env, user.school_id, studentUserIds, "assignment.new", "تکلیف جدید", body.title);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "assignment.create",
        entityType: "assignment", entityId: assignmentId,
        meta: { class_id: body.class_id, subject_id: body.subject_id, title: body.title }, request,
    });

    return created({ id: assignmentId }, "تکلیف ثبت شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.delete");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id"]);
    const assignment = await loadAssignmentOwnedByTeacher(env, body.id, teacher.id, user.school_id);

    const db = q(env);
    await db.run(`UPDATE assignments SET deleted_at = datetime('now') WHERE id = ?`, assignment.id);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "assignment.delete",
        entityType: "assignment", entityId: assignment.id, request,
    });

    return ok(null, "تکلیف حذف شد");
});
