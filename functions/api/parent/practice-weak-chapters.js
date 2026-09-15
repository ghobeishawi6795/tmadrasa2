// GET /api/parent/practice-weak-chapters?student_id=
// Same weak-chapter ranking as the student's own تمرین page, shown on the
// parent's وضعیت تحصیلی page. Uses grades.view (not practice.use --
// that permission is student-only) since this is read-only visibility
// into a child's standing, the same gate /api/parent/grades already uses.
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getParentRecord, assertParentOwnsStudent } from "../_shared/ownership.js";
import { getEligibleSubjectIds, getWeakestChapters } from "../_shared/practice.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const parent = await getParentRecord(env, user.id, user.school_id);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    if (!studentId) throw errors.validation("student_id الزامی است");
    await assertParentOwnsStudent(env, parent.id, studentId, user.school_id);

    const subjectIds = await getEligibleSubjectIds(env, studentId, user.school_id);
    const chapters = await getWeakestChapters(env, studentId, user.school_id, subjectIds);
    return ok(chapters);
});
