// /api/teacher/grades
// GET  ?class_id=&subject_id=&grade_period_id=(optional) -> list grades for that class+subject
// POST { student_id, subject_id, class_id, grade_period_id, source, source_id, score, max_score, weight, feedback }
// PUT  { id, score, max_score, feedback } -> only the teacher who created it may edit it
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, assertTeacherCanGradeStudent } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { notifyUsers } from "../_shared/notify.js";

const VALID_SOURCES = ["assignment", "exam", "manual", "final"];

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const teacher = await getTeacherRecord(env, user.id);
    const db = q(env);
    const url = new URL(request.url);

    const classId = url.searchParams.get("class_id");
    const subjectId = url.searchParams.get("subject_id");
    if (!classId || !subjectId) throw errors.validation("class_id و subject_id الزامی هستند");

    const periodId = url.searchParams.get("grade_period_id");

    const rows = await db.all(
        `SELECT g.*, u.full_name as student_name
           FROM grades g
           JOIN students s ON s.id = g.student_id
           JOIN users u ON u.id = s.user_id
           JOIN class_students cs ON cs.student_id = g.student_id AND cs.class_id = ?
          WHERE g.subject_id = ? AND g.teacher_id = ? AND g.school_id = ?
            AND (? IS NULL OR g.grade_period_id = ?)
          ORDER BY u.full_name`,
        classId, subjectId, teacher.id, user.school_id, periodId, periodId
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["student_id", "class_id", "subject_id", "score", "max_score"]);

    if (!VALID_SOURCES.includes(body.source || "manual")) throw errors.validation("source نامعتبر است");
    if (body.max_score <= 0) throw errors.validation("max_score باید مثبت باشد");
    if (body.score < 0 || body.score > body.max_score) {
        throw errors.validation(`نمره باید بین ۰ و ${body.max_score} باشد`);
    }

    // teacher must actually teach this subject in this class, AND the student must be in it
    await assertTeacherCanGradeStudent(env, teacher.id, body.student_id, body.class_id, body.subject_id, user.school_id);

    const db = q(env);
    const result = await db.run(
        `INSERT INTO grades (school_id, student_id, subject_id, grade_period_id, teacher_id,
                              source, source_id, score, max_score, weight, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.school_id, body.student_id, body.subject_id, body.grade_period_id || null, teacher.id,
        body.source || "manual", body.source_id || null, body.score, body.max_score,
        body.weight ?? 1, body.feedback || null
    );

    // notify the student + their parent(s) that a grade is ready
    const parentRows = await db.all(
        `SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id
          WHERE ps.student_id = ? AND ps.school_id = ?`,
        body.student_id, user.school_id
    );
    const studentRow = await db.first(`SELECT user_id FROM students WHERE id = ?`, body.student_id);
    await notifyUsers(
        env, user.school_id,
        [studentRow.user_id, ...parentRows.results.map(p => p.user_id)],
        "grade_ready", "نمره جدید ثبت شد", null
    );

    return created({ id: result.meta.last_row_id }, "نمره ثبت شد");
});

export const onRequestPut = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const grade = await db.first(
        `SELECT * FROM grades WHERE id = ? AND school_id = ?`, body.id, user.school_id
    );
    if (!grade) throw errors.notFound("نمره پیدا نشد");
    if (grade.teacher_id !== teacher.id) throw errors.forbidden("این نمره را شما ثبت نکرده‌اید");

    const newMax = body.max_score ?? grade.max_score;
    const newScore = body.score ?? grade.score;
    if (newMax <= 0) throw errors.validation("max_score باید مثبت باشد");
    if (newScore < 0 || newScore > newMax) throw errors.validation(`نمره باید بین ۰ و ${newMax} باشد`);

    await db.run(
        `UPDATE grades SET score = ?, max_score = ?, feedback = ? WHERE id = ?`,
        newScore, newMax, body.feedback ?? grade.feedback, grade.id
    );
    return ok(null, "نمره به‌روزرسانی شد");
});
