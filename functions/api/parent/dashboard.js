// GET /api/parent/dashboard -- summary across ALL of this parent's children
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { getParentRecord } from "../_shared/ownership.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const parent = await getParentRecord(env, user.id, user.school_id);
    const db = q(env);

    const children = await db.all(
        `SELECT student_id FROM parent_students WHERE parent_id = ? AND school_id = ?`,
        parent.id, user.school_id
    );
    const studentIds = children.results.map(c => c.student_id);
    if (studentIds.length === 0) return ok({ children_count: 0 });

    const placeholders = studentIds.map(() => "?").join(",");

    // due_at/start_at are stored exactly as the client sends them (an ISO
    // string like "2026-07-05T08:00:00.000Z"), while SQLite's datetime('now')
    // returns "2026-07-05 08:00:00" (space, no ms/Z). Comparing those two
    // formats as raw TEXT is lexicographic: for two timestamps on the SAME
    // calendar date, 'T' (0x54) sorts after ' ' (0x20) regardless of the
    // actual time that follows, so e.g. an assignment due at 08:00 today
    // would wrongly compare as "later than" 20:00 today. Wrapping both
    // sides in datetime(...) normalizes to the same format before compare.
    const activeAssignments = await db.first(
        `SELECT COUNT(DISTINCT a.id) as c
           FROM assignments a
           JOIN class_students cs ON cs.class_id = a.class_id
          WHERE cs.student_id IN (${placeholders}) AND datetime(a.due_at) > datetime('now') AND a.deleted_at IS NULL`,
        ...studentIds
    );

    const upcomingExams = await db.first(
        `SELECT COUNT(DISTINCT e.id) as c
           FROM exams e
           JOIN class_students cs ON cs.class_id = e.class_id
          WHERE cs.student_id IN (${placeholders}) AND e.status = 'published'
            AND datetime(e.start_at) > datetime('now') AND e.deleted_at IS NULL`,
        ...studentIds
    );

    const recentAbsences = await db.first(
        `SELECT COUNT(*) as c FROM attendance_records ar
           JOIN attendance_sessions s ON s.id = ar.session_id
          WHERE ar.student_id IN (${placeholders}) AND ar.status = 'absent'
            AND s.session_date > date('now', '-14 days')`,
        ...studentIds
    );

    return ok({
        children_count: studentIds.length,
        active_assignments: activeAssignments.c,
        upcoming_exams: upcomingExams.c,
        recent_absences_14d: recentAbsences.c,
    });
});
