// GET /api/teacher/practice-weak-chapters?student_id=&class_id=&subject_id=
// Scoped to one class+subject at a time -- the same combo the teacher's
// نمرات page already has selected -- and reuses assertTeacherCanGradeStudent
// (the exact check /api/teacher/grades POST uses) so a teacher can only see
// this for a student they actually teach that subject to.
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, assertTeacherCanGradeStudent } from "../_shared/ownership.js";
import { getWeakestChapters } from "../_shared/practice.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    const classId = url.searchParams.get("class_id");
    const subjectId = url.searchParams.get("subject_id");
    if (!studentId || !classId || !subjectId) {
        throw errors.validation("student_id، class_id و subject_id الزامی هستند");
    }

    await assertTeacherCanGradeStudent(env, teacher.id, studentId, classId, subjectId, user.school_id);

    const chapters = await getWeakestChapters(env, studentId, user.school_id, [Number(subjectId)]);
    return ok(chapters);
});
