import { q } from "./db.js";

// Weighted average per subject, normalized to a percentage internally then
// converted to Iran's conventional out-of-20 scale for display.
//
// BUGFIX CONTEXT: this used to average raw `score` values directly
// (sum(score*weight)/sum(weight)), which only produces a meaningful number
// if every grade in a subject shares the same max_score -- true back when
// grades only came from manual teacher entry (who'd naturally always grade
// out of 20). Now that assignment/exam scores are auto-synced in with their
// own real max_score (e.g. a 10-point interactive assignment next to a
// 100-point exam), mixing raw scores would badly skew the average. Normalize
// to a 0-100 percentage per entry first (same approach admin/reports.js
// already uses for its class-average query), then scale the final number
// back to /20 so the displayed figure still matches what this school's UI
// and users expect.
export async function buildReportCard(env, studentId, schoolId, gradePeriodId) {
    const db = q(env);

    const rows = await db.all(
        `SELECT g.*, s.name as subject_name FROM grades g
           JOIN subjects s ON s.id = g.subject_id
          WHERE g.student_id = ? AND g.school_id = ?
            AND (? IS NULL OR g.grade_period_id = ?)
          ORDER BY s.name, g.created_at`,
        studentId, schoolId, gradePeriodId, gradePeriodId
    );

    const bySubject = {};
    for (const g of rows.results) {
        if (!bySubject[g.subject_id]) {
            bySubject[g.subject_id] = { subject_id: g.subject_id, subject_name: g.subject_name, entries: [], weightSum: 0, weightedPercent: 0 };
        }
        const bucket = bySubject[g.subject_id];
        bucket.entries.push({ source: g.source, score: g.score, max_score: g.max_score, feedback: g.feedback });
        if (g.max_score > 0) {
            bucket.weightSum += g.weight;
            bucket.weightedPercent += (g.score / g.max_score) * 100 * g.weight;
        }
    }

    const subjects = Object.values(bySubject).map(b => ({
        subject_id: b.subject_id,
        subject_name: b.subject_name,
        entries: b.entries,
        average: b.weightSum > 0 ? Number(((b.weightedPercent / b.weightSum) / 100 * 20).toFixed(2)) : null,
    }));

    const gradedSubjects = subjects.filter(s => s.average !== null);
    const overallAverage = gradedSubjects.length
        ? Number((gradedSubjects.reduce((sum, s) => sum + s.average, 0) / gradedSubjects.length).toFixed(2))
        : null;

    return { subjects, overall_average: overallAverage };
}
