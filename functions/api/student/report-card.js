// GET /api/student/report-card?grade_period_id=(optional -> defaults to most recent period)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { buildReportCard } from "../_shared/reportcard.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const student = await getStudentRecord(env, user.id);
    const db = q(env);

    const url = new URL(request.url);
    let periodId = url.searchParams.get("grade_period_id");

    let period = null;
    if (periodId) {
        period = await db.first(`SELECT * FROM grade_periods WHERE id = ? AND school_id = ?`, periodId, user.school_id);
    } else {
        period = await db.first(
            `SELECT * FROM grade_periods WHERE school_id = ? ORDER BY start_at DESC LIMIT 1`,
            user.school_id
        );
        periodId = period ? period.id : null;
    }

    const report = await buildReportCard(env, student.id, user.school_id, periodId);
    return ok({ period, ...report });
});
