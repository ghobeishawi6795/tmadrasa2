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

// BUGFIX: this used to be `ORDER BY start_at DESC LIMIT 1` with no check
// that "now" is actually inside that period's range -- at a term boundary
// (before the next period's start_at arrives, or if a future period was
// pre-created in advance) a grade got silently attributed to whichever
// period merely had the latest start_at, not the one actually in effect.
// Fallback: if no period's range currently contains "now" (e.g. a gap
// between terms with no period covering today), fall back to the most
// recent period whose start_at has already passed, same as the old
// behavior -- better to file it under the last real period than not sync
// the grade at all.
export async function getCurrentGradePeriod(db, schoolId) {
    const current = await db.first(
        `SELECT * FROM grade_periods
          WHERE school_id = ? AND start_at <= datetime('now')
            AND (end_at IS NULL OR end_at >= datetime('now'))
          ORDER BY start_at DESC LIMIT 1`,
        schoolId
    );
    if (current) return current;
    return await db.first(
        `SELECT * FROM grade_periods WHERE school_id = ? AND start_at <= datetime('now') ORDER BY start_at DESC LIMIT 1`,
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

    // BUGFIX: this SELECT-then-INSERT is not atomic on its own -- two
    // concurrent syncs for the same (student, subject, source, source_id)
    // could both see `existing` as null and both try to INSERT. A DB-level
    // trigger (028_security_integrity.sql, trg_grades_unique_source) is the
    // real fix and guarantees only one row ever lands; this catch just turns
    // the trigger's ABORT into "someone else already synced this grade,
    // fetch what's there" instead of letting a raw SQLite error bubble up as
    // an unhandled 500 to whoever's request lost the race.
    try {
        const result = await db.run(
            `INSERT INTO grades (school_id, student_id, subject_id, grade_period_id, teacher_id, source, source_id, score, max_score, weight, feedback)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            schoolId, studentId, subjectId, gradePeriodId, teacherId, source, sourceId, score, maxScore, feedback ?? null
        );
        return result.meta.last_row_id;
    } catch (e) {
        if (/duplicate grade source/i.test(String(e?.message || e))) {
            const winner = await db.first(
                `SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND source = ? AND source_id = ?`,
                studentId, subjectId, source, sourceId
            );
            if (winner) {
                await db.run(
                    `UPDATE grades SET score = ?, max_score = ?, feedback = ?, teacher_id = ?, grade_period_id = ? WHERE id = ?`,
                    score, maxScore, feedback ?? null, teacherId, gradePeriodId, winner.id
                );
                return winner.id;
            }
        }
        throw e;
    }
}
