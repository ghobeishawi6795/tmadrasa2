// Shared helper: keeps the `grades` table (which report cards read from) in
// sync with scores produced elsewhere in the app (graded assignment
// submissions, finalized exam attempts).
//
// BUGFIX CONTEXT: before this file existed, /api/teacher/submissions (grading
// homework) and the exam-attempt/exam-grading flows only ever wrote to
// `submissions.score` / `exam_attempts.total_score` -- neither ever inserted
// a row into `grades`. Since /api/student/report-card, /api/parent/grades,
// and /api/admin/reports all read exclusively from `grades`, this meant
// report cards were permanently empty of assignment and exam scores unless a
// teacher separately, manually re-entered every score a second time via
// /api/teacher/grades. This helper is called from the real grading flows so
// that no double-entry is needed.
import { q } from "./db.js";

export async function getCurrentGradePeriod(db, schoolId) {
    return await db.first(
        `SELECT * FROM grade_periods WHERE school_id = ? ORDER BY start_at DESC LIMIT 1`,
        schoolId
    );
}

/**
 * Insert or update the one `grades` row that represents this source's score
 * for this student+subject (keyed on student_id + subject_id + source +
 * source_id, so re-grading the same assignment/exam updates in place instead
 * of accumulating duplicate rows that would skew the subject average).
 */
export async function syncGradeFromSource(env, {
    schoolId, studentId, subjectId, teacherId, source, sourceId, score, maxScore, feedback,
}) {
    const db = q(env);
    const period = await getCurrentGradePeriod(db, schoolId);
    const gradePeriodId = period ? period.id : null;

    const existing = await db.first(
        `SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND source = ? AND source_id = ?`,
        studentId, subjectId, source, sourceId
    );

    if (existing) {
        await db.run(
            `UPDATE grades SET score = ?, max_score = ?, feedback = ?, teacher_id = ?, grade_period_id = ? WHERE id = ?`,
            score, maxScore, feedback ?? null, teacherId, gradePeriodId, existing.id
        );
        return existing.id;
    }

    const result = await db.run(
        `INSERT INTO grades (school_id, student_id, subject_id, grade_period_id, teacher_id, source, source_id, score, max_score, weight, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        schoolId, studentId, subjectId, gradePeriodId, teacherId, source, sourceId, score, maxScore, feedback ?? null
    );
    return result.meta.last_row_id;
}
