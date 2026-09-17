// GET /api/student/report-card?grade_period_id=(optional -> defaults to most recent period)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getStudentRecord } from "../_shared/ownership.js";
import { buildReportCard } from "../_shared/reportcard.js";
import { getCurrentGradePeriod } from "../_shared/grades-sync.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const student = await getStudentRecord(env, user.id, user.school_id);
    const db = q(env);

    const url = new URL(request.url);
    let periodId = url.searchParams.get("grade_period_id");

    let period = null;
    if (periodId === "all") {
        // explicit request to ignore period filtering entirely (see
        // admin/grade-periods.js) -- distinct from "no param given", which
        // means "use whatever period is current right now".
        periodId = null;
    } else if (periodId) {
        period = await db.first(`SELECT * FROM grade_periods WHERE id = ? AND school_id = ?`, periodId, user.school_id);
    } else {
        // BUGFIX: was a duplicated, flawed `ORDER BY start_at DESC LIMIT 1`
        // with no check that "now" actually falls inside that period's
        // range -- now shares the same fixed lookup used when syncing grades.
        period = await getCurrentGradePeriod(db, user.school_id);
        periodId = period ? period.id : null;
    }

    const report = await buildReportCard(env, student.id, user.school_id, periodId);
    return ok({ period, ...report });
});
