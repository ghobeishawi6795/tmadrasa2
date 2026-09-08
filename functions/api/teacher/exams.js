// /api/teacher/exams
// GET    -> list this teacher's exams
// POST   -> create exam (draft)
// PUT    -> update exam (draft only, unless just changing status via publish/close)
// DELETE -> soft delete
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, assertClassOwnedByTeacher, assertTeacherTeachesSubjectInClass, loadExamOwnedByTeacher } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { notifyUsers, getClassUserIds } from "../_shared/notify.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.view");
    const teacher = await getTeacherRecord(env, user.id);

    const db = q(env);
    const rows = await db.all(
        `SELECT e.*, c.name as class_name, s.name as subject_name
           FROM exams e
           JOIN classes c ON c.id = e.class_id
           JOIN subjects s ON s.id = e.subject_id
          WHERE e.teacher_id = ? AND e.school_id = ? AND e.deleted_at IS NULL
          ORDER BY e.created_at DESC`,
        teacher.id, user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["class_id", "subject_id", "title", "start_at", "end_at", "duration_minutes"]);

    if (new Date(body.start_at) >= new Date(body.end_at)) {
        throw errors.validation("زمان پایان باید بعد از زمان شروع باشد");
    }
    if (Number(body.duration_minutes) <= 0) throw errors.validation("مدت آزمون باید مثبت باشد");

    await assertClassOwnedByTeacher(env, body.class_id, teacher.id, user.school_id);
    await assertTeacherTeachesSubjectInClass(env, teacher.id, body.class_id, body.subject_id, user.school_id);

    const db = q(env);
    const result = await db.run(
        `INSERT INTO exams (school_id, class_id, subject_id, teacher_id, title, description,
                             type, start_at, end_at, duration_minutes, max_attempts, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        user.school_id, body.class_id, body.subject_id, teacher.id, body.title,
        body.description || null, body.type || "quiz", body.start_at, body.end_at,
        body.duration_minutes, body.max_attempts || 1
    );

    return created({ id: result.meta.last_row_id }, "آزمون ساخته شد (پیش‌نویس)");
});

export const onRequestPut = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id"]);
    const exam = await loadExamOwnedByTeacher(env, body.id, teacher.id, user.school_id);

    if (exam.status !== "draft" && (body.title || body.class_id || body.subject_id)) {
        throw errors.forbidden("آزمون منتشرشده را فقط می‌توان منتشر یا بسته کرد، نه ویرایش محتوا");
    }

    const db = q(env);

    if (body.action === "publish") {
        const countRow = await db.first(
            `SELECT COUNT(*) as c FROM exam_questions WHERE exam_id = ?`, exam.id
        );
        if (countRow.c === 0) throw errors.validation("آزمون بدون سؤال قابل انتشار نیست");
        await db.run(
            `UPDATE exams SET status='published', published_at=datetime('now'), updated_at=datetime('now') WHERE id = ?`,
            exam.id
        );

        const { studentUserIds } = await getClassUserIds(env, exam.class_id);
        await notifyUsers(env, user.school_id, studentUserIds, "exam_published",
            "آزمون جدید منتشر شد", exam.title);

        await writeAudit(env, {
            schoolId: user.school_id, actorUserId: user.id, action: "exam.publish",
            entityType: "exam", entityId: exam.id, request,
        });

        return ok(null, "آزمون منتشر شد");
    }

    if (body.action === "close") {
        await db.run(`UPDATE exams SET status='closed', updated_at=datetime('now') WHERE id = ?`, exam.id);

        await writeAudit(env, {
            schoolId: user.school_id, actorUserId: user.id, action: "exam.close",
            entityType: "exam", entityId: exam.id, request,
        });

        return ok(null, "آزمون بسته شد");
    }

    // plain field update (draft only)
    await db.run(
        `UPDATE exams SET title=?, description=?, start_at=?, end_at=?, duration_minutes=?,
                           max_attempts=?, updated_at=datetime('now')
          WHERE id = ?`,
        body.title ?? exam.title, body.description ?? exam.description,
        body.start_at ?? exam.start_at, body.end_at ?? exam.end_at,
        body.duration_minutes ?? exam.duration_minutes, body.max_attempts ?? exam.max_attempts,
        exam.id
    );
    return ok(null, "آزمون به‌روزرسانی شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.delete");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id"]);
    const exam = await loadExamOwnedByTeacher(env, body.id, teacher.id, user.school_id);

    const db = q(env);
    await db.run(`UPDATE exams SET deleted_at = datetime('now') WHERE id = ?`, exam.id);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "exam.delete",
        entityType: "exam", entityId: exam.id, request,
    });

    return ok(null, "آزمون حذف شد");
});
