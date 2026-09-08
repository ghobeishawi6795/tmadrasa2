// /api/student/exams
// GET ?id=123  -> one exam's questions (correct answers stripped)
// GET           -> list exams visible to this student (published, in their classes)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord, assertStudentInClass } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

// Strips every field that would leak the correct answer.
function toSafeQuestion(q, options) {
    return {
        id: q.id,
        type: q.type,
        text: q.text,
        options: q.type === "multiple_choice"
            ? options.map(o => ({ id: o.id, text: o.text })) // no is_correct
            : undefined,
    };
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "exams.view");
    const student = await getStudentRecord(env, user.id);
    const db = q(env);

    const url = new URL(request.url);
    const examId = url.searchParams.get("id");

    if (!examId) {
        const rows = await db.all(
            `SELECT e.id, e.title, e.description, e.start_at, e.end_at, e.duration_minutes,
                    e.max_attempts, c.name as class_name, s.name as subject_name
               FROM exams e
               JOIN classes c ON c.id = e.class_id
               JOIN subjects s ON s.id = e.subject_id
               JOIN class_students cs ON cs.class_id = e.class_id AND cs.student_id = ?
              WHERE e.school_id = ? AND e.status = 'published' AND e.deleted_at IS NULL
              ORDER BY e.start_at ASC`,
            student.id, user.school_id
        );
        return ok(rows.results);
    }

    const exam = await db.first(
        `SELECT * FROM exams WHERE id = ? AND school_id = ? AND status = 'published' AND deleted_at IS NULL`,
        examId, user.school_id
    );
    if (!exam) throw errors.notFound("آزمون پیدا نشد یا هنوز منتشر نشده است");
    await assertStudentInClass(env, student.id, exam.class_id, user.school_id);

    if (new Date() < new Date(exam.start_at)) throw errors.forbidden("آزمون هنوز شروع نشده است");
    if (new Date() > new Date(exam.end_at)) throw errors.forbidden("زمان آزمون به پایان رسیده است");

    const attemptsCount = await db.first(
        `SELECT COUNT(*) as c FROM exam_attempts WHERE exam_id = ? AND student_id = ?`,
        exam.id, student.id
    );
    if (attemptsCount.c >= exam.max_attempts) {
        throw errors.forbidden("تعداد دفعات مجاز شرکت در این آزمون به پایان رسیده است");
    }

    const examQuestions = await db.all(
        `SELECT q.* FROM exam_questions eq JOIN questions q ON q.id = eq.question_id
          WHERE eq.exam_id = ? ORDER BY eq.position ASC`,
        exam.id
    );

    const safeQuestions = [];
    for (const question of examQuestions.results) {
        let options = [];
        if (question.type === "multiple_choice") {
            const opts = await db.all(`SELECT * FROM question_options WHERE question_id = ?`, question.id);
            options = opts.results;
        }
        safeQuestions.push(toSafeQuestion(question, options));
    }

    return ok({
        id: exam.id, title: exam.title, description: exam.description,
        duration_minutes: exam.duration_minutes, questions: safeQuestions,
    });
});
