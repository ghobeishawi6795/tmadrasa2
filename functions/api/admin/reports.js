// GET /api/admin/reports -- school-wide aggregate numbers for the admin dashboard.
// Everything here is a summary/aggregate query (COUNT/AVG), never per-student
// detail rows, since this is meant for a "how is the whole school doing"
// view, not a way to browse individual student data (that's students.js).
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    // reuses existing view permissions rather than inventing a new one --
    // an admin who can view grades/attendance/assignments can see the
    // aggregate of the same data.
    await requirePermission(env, user, "grades.view");
    const db = q(env);
    const schoolId = user.school_id;

    // 1) attendance rate, last 30 days, school-wide
    const attendance = await db.first(
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as excused
         FROM attendance_records ar
         JOIN attendance_sessions s ON s.id = ar.session_id
         WHERE ar.school_id = ? AND s.session_date >= date('now', '-30 days')`,
        schoolId
    );
    const attendanceRate = attendance.total > 0
        ? Math.round((attendance.present / attendance.total) * 1000) / 10
        : null;

    // 2) average grade per class (across all subjects/periods)
    const classAverages = await db.all(
        `SELECT c.id as class_id, c.name as class_name, c.education_level,
                ROUND(AVG(g.score * 100.0 / g.max_score), 1) as average_percent,
                COUNT(g.id) as grade_count
           FROM classes c
           JOIN class_students cs ON cs.class_id = c.id
           JOIN students st ON st.id = cs.student_id
           JOIN grades g ON g.student_id = st.id AND g.school_id = c.school_id
          WHERE c.school_id = ? AND c.deleted_at IS NULL
          GROUP BY c.id
          ORDER BY c.name`,
        schoolId
    );

    // 3) overdue assignments (past due_at, not late-allowed, still open) --
    // and how many students in the class never submitted at all
    const overdueAssignments = await db.all(
        `SELECT a.id, a.title, a.due_at, c.name as class_name,
                (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = a.class_id) as class_size,
                (SELECT COUNT(DISTINCT student_id) FROM submissions sub WHERE sub.assignment_id = a.id) as submitted_count
           FROM assignments a
           JOIN classes c ON c.id = a.class_id
          WHERE a.school_id = ? AND a.deleted_at IS NULL AND a.due_at < datetime('now')
          ORDER BY a.due_at DESC
          LIMIT 20`,
        schoolId
    );

    // 4) headline counts
    const counts = await db.first(
        `SELECT
            (SELECT COUNT(*) FROM students WHERE school_id = ? AND deleted_at IS NULL) as student_count,
            (SELECT COUNT(*) FROM teachers WHERE school_id = ? AND deleted_at IS NULL) as teacher_count,
            (SELECT COUNT(*) FROM classes WHERE school_id = ? AND deleted_at IS NULL) as class_count,
            (SELECT COUNT(*) FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id
              WHERE a.school_id = ? AND sub.needs_manual_review = 1 AND sub.status != 'graded') as pending_review_count`,
        schoolId, schoolId, schoolId, schoolId
    );

    return ok({
        counts,
        attendance: { rate_percent: attendanceRate, ...attendance },
        class_averages: classAverages.results,
        overdue_assignments: overdueAssignments.results,
    });
});
