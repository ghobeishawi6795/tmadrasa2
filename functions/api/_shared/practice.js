// Shared by the three student/practice-*.js endpoints.
import { q } from "./db.js";

// A student may only see practice questions for subjects actually taught
// to their class (via teaching_assignments) -- same scoping fact the exam
// list already relies on (JOIN class_students + subjects on the exam's own
// subject_id), just derived directly since practice questions aren't tied
// to one exam/class the way exam questions are.
export async function getEligibleSubjectIds(env, studentId, schoolId) {
    const db = q(env);
    const cls = await db.first(
        `SELECT class_id FROM class_students WHERE student_id = ? AND school_id = ? LIMIT 1`,
        studentId, schoolId
    );
    if (!cls) return [];
    const rows = await db.all(
        `SELECT DISTINCT subject_id FROM teaching_assignments WHERE class_id = ? AND school_id = ?`,
        cls.class_id, schoolId
    );
    return rows.results.map(r => r.subject_id);
}

// A chapter only counts as a signal once the student has actually answered
// a few questions in it -- one unlucky guess shouldn't label a whole
// chapter "weak". Shared by the student/parent/teacher weak-chapters
// endpoints so the threshold and ranking stay identical everywhere it's shown.
export const WEAK_CHAPTER_MIN_ATTEMPTS = 3;

export async function getWeakestChapters(env, studentId, schoolId, subjectIds, limit = 5) {
    if (!subjectIds || !subjectIds.length) return [];
    const db = q(env);
    const placeholders = subjectIds.map(() => "?").join(",");
    // Only auto-graded results (is_correct IS NOT NULL) have a real
    // right/wrong to rank by -- short_answer/long_answer/custom_html/manual
    // fill_blank stay excluded, same as everywhere else in the practice feature.
    const rows = await db.all(
        `SELECT q.subject_id, s.name as subject_name, q.chapter,
                COUNT(spr.id) as answered_count,
                SUM(CASE WHEN spr.is_correct = 1 THEN 1 ELSE 0 END) as correct_count
           FROM student_practice_results spr
           JOIN questions q ON q.id = spr.question_id
           JOIN subjects s ON s.id = q.subject_id
          WHERE spr.student_id = ? AND spr.school_id = ? AND spr.is_correct IS NOT NULL
            AND q.chapter IS NOT NULL AND q.chapter != ''
            AND q.subject_id IN (${placeholders})
          GROUP BY q.subject_id, q.chapter
         HAVING answered_count >= ?
          ORDER BY (CAST(correct_count AS REAL) / answered_count) ASC, answered_count DESC
          LIMIT ?`,
        studentId, schoolId, ...subjectIds, WEAK_CHAPTER_MIN_ATTEMPTS, limit
    );
    return rows.results.map(r => ({
        ...r,
        correct_percent: Math.round((r.correct_count / r.answered_count) * 100)
    }));
}
