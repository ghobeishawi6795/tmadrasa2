// GET /api/student/practice-weak-chapters
// Surfaces up to 5 chapters (across the student's own eligible subjects)
// where their auto-graded تمرین accuracy is lowest -- see
// WEAK_CHAPTER_MIN_ATTEMPTS in _shared/practice.js for the noise floor.
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { getEligibleSubjectIds, getWeakestChapters } from "../_shared/practice.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "practice.use");
    const student = await getStudentRecord(env, user.id, user.school_id);

    const subjectIds = await getEligibleSubjectIds(env, student.id, user.school_id);
    const chapters = await getWeakestChapters(env, student.id, user.school_id, subjectIds);
    return ok(chapters);
});
