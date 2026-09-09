// GET /api/parent/grades?student_id=123&grade_period_id=(optional -> defaults to most recent period)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getParentRecord, assertParentOwnsStudent } from "../_shared/ownership.js";
import { buildReportCard } from "../_shared/reportcard.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grades.view");
    const parent = await getParentRecord(env, user.id);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    if (!studentId) throw errors.validation("student_id الزامی است");
    await assertParentOwnsStudent(env, parent.id, studentId, user.school_id);

    const db = q(env);
    let periodId = url.searchParams.get("grade_period_id");

    // BUGFIX: this endpoint used to never look up/return the grade period at
    // all (unlike /api/student/report-card, which does), so the parent's
    // report card and its printed PDF always showed "no period" even when
    // one existed. Mirror the student endpoint's logic here.
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

    const report = await buildReportCard(env, studentId, user.school_id, periodId);
    return ok({ period, ...report });
});
