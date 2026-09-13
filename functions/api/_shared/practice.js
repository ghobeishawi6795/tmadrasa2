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
