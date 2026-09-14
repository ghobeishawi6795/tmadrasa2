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

const VALID_TYPES = ["quiz", "exam", "practice"];

function validateExamTiming(body, fallback = {}) {
    const startRaw = body.start_at ?? fallback.start_at;
    const endRaw = body.end_at ?? fallback.end_at;
    const durationRaw = body.duration_minutes ?? fallback.duration_minutes;
    const attemptsRaw = body.max_attempts ?? fallback.max_attempts ?? 1;
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    const duration = Number(durationRaw);
    const attempts = Number(attemptsRaw);
    if (!startRaw || Number.isNaN(start.getTime()) || !endRaw || Number.isNaN(end.getTime()) || start >= end) throw errors.validation("زمان شروع و پایان آزمون نامعتبر است");
    if (!Number.isInteger(duration) || duration <= 0) throw errors.validation("مدت آزمون باید عدد صحیح مثبت باشد");
    if (!Number.isInteger(attempts) || attempts < 1) throw errors.validation("تعداد دفعات مجاز باید عدد صحیح مثبت باشد");
    return { start, end, duration, attempts };
}


export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.view");
    const teacher = await getTeacherRecord(env, user.id);

    const db = q(env);
    const rows = await db.all(
        `SELECT e.*, c.name as class_name, s.name as subject_name, ch.name as chapter_name
           FROM exams e
           JOIN classes c ON c.id = e.class_id
           JOIN subjects s ON s.id = e.subject_id
           LEFT JOIN chapters ch ON ch.id = e.chapter_id
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

    const timing = validateExamTiming(body);

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
        `INSERT INTO exams (school_id, class_id, subject_id, teacher_id, title, description,
                             type, start_at, end_at, duration_minutes, max_attempts, status, chapter_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        user.school_id, body.class_id, body.subject_id, teacher.id, body.title,
        body.description || null, body.type || "quiz", body.start_at, body.end_at,
        timing.duration, timing.attempts, chapterId
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

    const hasChapterField = Object.prototype.hasOwnProperty.call(body, "chapter_id");
    if (exam.status !== "draft" && (body.title || body.class_id || body.subject_id || hasChapterField)) {
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

    // Any ordinary field update is draft-only. The previous guard only blocked
    // a subset of content fields, allowing published/closed exams to have their
    // timing, duration, or attempt limit changed.
    if (exam.status !== "draft") throw errors.forbidden("آزمون منتشرشده یا بسته‌شده قابل ویرایش نیست");
    if (body.class_id !== undefined && Number(body.class_id) !== Number(exam.class_id)) throw errors.validation("تغییر کلاس آزمون در ویرایش مجاز نیست");
    if (body.subject_id !== undefined && Number(body.subject_id) !== Number(exam.subject_id)) throw errors.validation("تغییر درس آزمون در ویرایش مجاز نیست");
    const timing = validateExamTiming(body, exam);
    let chapterId = exam.chapter_id;
    if (hasChapterField) {
        chapterId = null;
        if (body.chapter_id) {
            const chapter = await db.first(
                `SELECT id FROM chapters WHERE id = ? AND teacher_id = ? AND subject_id = ?`,
                body.chapter_id, teacher.id, body.subject_id ?? exam.subject_id
            );
            if (!chapter) throw errors.validation("فصل انتخاب‌شده معتبر نیست");
            chapterId = chapter.id;
        }
    }
    await db.run(
        `UPDATE exams SET title=?, description=?, start_at=?, end_at=?, duration_minutes=?,
                           max_attempts=?, chapter_id=?, updated_at=datetime('now')
          WHERE id = ?`,
        body.title ?? exam.title, body.description ?? exam.description,
        body.start_at ?? exam.start_at, body.end_at ?? exam.end_at,
        timing.duration, timing.attempts,
        chapterId, exam.id
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
