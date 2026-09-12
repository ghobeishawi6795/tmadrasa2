// GET /api/teacher/question-analytics?question_id=123
// Scoped to the calling teacher's own exams (مدرسه has no shared/public
// bank yet, unlike دبستان's school-wide view of this same feature).
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

// ISO week label (yyyy-Www) for a date -- for a simple over-time trend.
function isoWeekLabel(dateInput) {
    const d = new Date(dateInput);
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    const teacher = await getTeacherRecord(env, user.id);

    const url = new URL(request.url);
    const questionId = url.searchParams.get("question_id");
    if (!questionId) throw errors.validation("question_id الزامی است");

    const db = q(env);
    const question = await db.first(
        `SELECT id, text FROM questions WHERE id = ? AND school_id = ? AND teacher_id = ? AND deleted_at IS NULL`,
        questionId, user.school_id, teacher.id
    );
    if (!question) throw errors.notFound("سؤال پیدا نشد");

    const totals = await db.first(
        `SELECT
            (SELECT COUNT(*) FROM exam_questions eq JOIN exams e ON e.id = eq.exam_id WHERE eq.question_id = ? AND e.teacher_id = ?) as usage_count,
            (SELECT COUNT(*) FROM exam_answers WHERE question_id = ?) as answer_count,
            (SELECT ROUND(AVG(is_correct) * 100) FROM exam_answers WHERE question_id = ? AND is_correct IS NOT NULL) as success_rate`,
        questionId, teacher.id, questionId, questionId
    );

    const rows = await db.all(
        `SELECT att.submitted_at, ea.is_correct, c.name as class_name
           FROM exam_answers ea
           JOIN exam_attempts att ON att.id = ea.attempt_id
           JOIN exams ex ON ex.id = att.exam_id
           LEFT JOIN classes c ON c.id = ex.class_id
          WHERE ea.question_id = ? AND ex.teacher_id = ? AND ea.is_correct IS NOT NULL AND att.submitted_at IS NOT NULL
          ORDER BY att.submitted_at ASC`,
        questionId, teacher.id
    );

    const byWeek = new Map(), byClass = new Map();
    for (const r of rows.results) {
        const week = isoWeekLabel(r.submitted_at);
        if (!byWeek.has(week)) byWeek.set(week, { correct: 0, total: 0 });
        const we = byWeek.get(week); we.total++; if (r.is_correct) we.correct++;

        const className = r.class_name || "بدون کلاس";
        if (!byClass.has(className)) byClass.set(className, { correct: 0, total: 0 });
        const ce = byClass.get(className); ce.total++; if (r.is_correct) ce.correct++;
    }

    const trend = [...byWeek.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([week, { correct, total }]) => ({ week, pct: Math.round((correct / total) * 100), total }));

    const byClassArr = [...byClass.entries()]
        .map(([className, { correct, total }]) => ({ class_name: className, correct, total, pct: Math.round((correct / total) * 100) }))
        .sort((a, b) => b.total - a.total);

    return ok({
        question_id: question.id, text: question.text,
        usage_count: totals.usage_count || 0,
        answer_count: totals.answer_count || 0,
        success_rate: totals.success_rate,
        trend, by_class: byClassArr,
    });
});
