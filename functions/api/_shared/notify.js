import { q } from "./db.js";

// Fire-and-forget style helper: creates one notification row per target user.
// Called from real events only (exam published, grade recorded, assignment created, ...)
// per the "notifications come from real events" rule in the project spec.
export async function notifyUsers(env, schoolId, userIds, type, title, body) {
    if (!userIds.length) return;
    const db = q(env);
    await db.batch(userIds.map(uid => ({
        sql: `INSERT INTO notifications (school_id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)`,
        params: [schoolId, uid, type, title, body || null],
    })));
}

// Users to notify when something happens to a class (its students' parents + the students themselves)
export async function getClassUserIds(env, classId) {
    const db = q(env);
    const students = await db.all(
        `SELECT st.user_id as user_id, st.id as student_id FROM class_students cs
           JOIN students st ON st.id = cs.student_id WHERE cs.class_id = ?`,
        classId
    );
    const studentUserIds = students.results.map(r => r.user_id);
    const studentIds = students.results.map(r => r.student_id);

    let parentUserIds = [];
    if (studentIds.length) {
        const placeholders = studentIds.map(() => "?").join(",");
        const parents = await db.all(
            `SELECT p.user_id FROM parent_students ps
               JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id IN (${placeholders})`,
            ...studentIds
        );
        parentUserIds = parents.results.map(r => r.user_id);
    }

    return { studentUserIds, parentUserIds };
}
