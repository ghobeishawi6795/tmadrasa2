import { q } from "./db.js";
import { errors } from "./response.js";

// Every one of these throws a 403/404 Response if the resource is missing
// or belongs to a different school / teacher / student than the caller.
// Ownership checks are ALWAYS in addition to the permission check, never instead of it.

export async function getTeacherRecord(env, userId) {
    const db = q(env);
    const teacher = await db.first(
        `SELECT * FROM teachers WHERE user_id = ? AND deleted_at IS NULL`, userId
    );
    if (!teacher) throw errors.forbidden("کاربر معلم نیست");
    return teacher;
}

export async function getStudentRecord(env, userId) {
    const db = q(env);
    const student = await db.first(
        `SELECT * FROM students WHERE user_id = ? AND deleted_at IS NULL`, userId
    );
    if (!student) throw errors.forbidden("کاربر دانش‌آموز نیست");
    return student;
}

export async function assertClassOwnedByTeacher(env, classId, teacherId, schoolId) {
    const db = q(env);
    const row = await db.first(
        `SELECT 1 FROM class_teachers ct
          JOIN classes c ON c.id = ct.class_id
         WHERE ct.class_id = ? AND ct.teacher_id = ? AND ct.school_id = ?
           AND c.deleted_at IS NULL`,
        classId, teacherId, schoolId
    );
    if (!row) throw errors.forbidden("این کلاس متعلق به شما نیست");
}

export async function assertTeacherTeachesSubjectInClass(env, teacherId, classId, subjectId, schoolId) {
    const db = q(env);
    const row = await db.first(
        `SELECT 1 FROM teaching_assignments
          WHERE teacher_id = ? AND class_id = ? AND subject_id = ? AND school_id = ?`,
        teacherId, classId, subjectId, schoolId
    );
    if (!row) throw errors.forbidden("شما این درس را در این کلاس تدریس نمی‌کنید");
}

export async function assertStudentInClass(env, studentId, classId, schoolId) {
    const db = q(env);
    const row = await db.first(
        `SELECT 1 FROM class_students WHERE student_id = ? AND class_id = ? AND school_id = ?`,
        studentId, classId, schoolId
    );
    if (!row) throw errors.forbidden("دانش‌آموز در این کلاس عضو نیست");
}

export async function loadExamOwnedByTeacher(env, examId, teacherId, schoolId) {
    const db = q(env);
    const exam = await db.first(
        `SELECT * FROM exams WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        examId, schoolId
    );
    if (!exam) throw errors.notFound("آزمون پیدا نشد");
    if (exam.teacher_id !== teacherId) throw errors.forbidden("این آزمون متعلق به شما نیست");
    return exam;
}

export async function loadQuestionOwnedByTeacher(env, questionId, teacherId, schoolId) {
    const db = q(env);
    const question = await db.first(
        `SELECT * FROM questions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        questionId, schoolId
    );
    if (!question) throw errors.notFound("سؤال پیدا نشد");
    if (question.teacher_id !== teacherId) throw errors.forbidden("این سؤال متعلق به شما نیست");
    return question;
}

export async function assertTeacherCanGradeStudent(env, teacherId, studentId, classId, subjectId, schoolId) {
    await assertTeacherTeachesSubjectInClass(env, teacherId, classId, subjectId, schoolId);
    await assertStudentInClass(env, studentId, classId, schoolId);
}

export async function getParentRecord(env, userId) {
    const db = q(env);
    const parent = await db.first(
        `SELECT * FROM parents WHERE user_id = ? AND deleted_at IS NULL`, userId
    );
    if (!parent) throw errors.forbidden("کاربر والد نیست");
    return parent;
}

export async function assertParentOwnsStudent(env, parentId, studentId, schoolId) {
    const db = q(env);
    const row = await db.first(
        `SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ? AND school_id = ?`,
        parentId, studentId, schoolId
    );
    if (!row) throw errors.forbidden("این دانش‌آموز فرزند شما نیست");
}

export async function loadAssignmentOwnedByTeacher(env, assignmentId, teacherId, schoolId) {
    const db = q(env);
    const assignment = await db.first(
        `SELECT * FROM assignments WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        assignmentId, schoolId
    );
    if (!assignment) throw errors.notFound("تکلیف پیدا نشد");
    if (assignment.teacher_id !== teacherId) throw errors.forbidden("این تکلیف متعلق به شما نیست");
    return assignment;
}

// Loads an assignment for a student, enforcing they're actually enrolled in its class.
export async function loadAssignmentForStudent(env, assignmentId, studentId, schoolId) {
    const db = q(env);
    const assignment = await db.first(
        `SELECT * FROM assignments WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        assignmentId, schoolId
    );
    if (!assignment) throw errors.notFound("تکلیف پیدا نشد");
    await assertStudentInClass(env, studentId, assignment.class_id, schoolId);
    return assignment;
}
