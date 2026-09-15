// GET /api/student/practice-subjects
// Lists the subject tabs for the student's "تمرین" page: only subjects
// taught to the student's own class, and only counting questions the
// teacher explicitly flagged is_practice=1. Each row also carries this
// student's own answered/correct/incorrect counts (LEFT JOIN so an
// unattempted question just contributes zeros) -- the frontend sums these
// across subjects for the page-top summary, so this one query covers both.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { getEligibleSubjectIds } from "../_shared/practice.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "practice.use");
    const student = await getStudentRecord(env, user.id, user.school_id);
    const db = q(env);

    const subjectIds = await getEligibleSubjectIds(env, student.id, user.school_id);
    if (!subjectIds.length) return ok([]);

    const placeholders = subjectIds.map(() => "?").join(",");
    const rows = await db.all(
        `SELECT s.id, s.name,
                COUNT(q.id) as question_count,
                COUNT(spr.id) as answered_count,
                SUM(CASE WHEN spr.is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
                SUM(CASE WHEN spr.is_correct = 0 THEN 1 ELSE 0 END) as incorrect_count
           FROM subjects s
           JOIN questions q ON q.subject_id = s.id
           LEFT JOIN student_practice_results spr ON spr.question_id = q.id AND spr.student_id = ?
          WHERE s.id IN (${placeholders}) AND q.school_id = ? AND q.is_practice = 1 AND q.deleted_at IS NULL
          GROUP BY s.id
          ORDER BY s.name`,
        student.id, ...subjectIds, user.school_id
    );
    return ok(rows.results);
});
