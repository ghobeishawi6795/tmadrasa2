// GET /api/student/grades?grade_period_id=(optional)
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { buildReportCard } from "../_shared/reportcard.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const student = await getStudentRecord(env, user.id);

    const url = new URL(request.url);
    const periodId = url.searchParams.get("grade_period_id");

    const report = await buildReportCard(env, student.id, user.school_id, periodId);
    return ok(report);
});
