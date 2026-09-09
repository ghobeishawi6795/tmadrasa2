// /api/admin/holidays -- school holiday calendar
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling, requireMaxLength } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "holidays.view");
    const db = q(env);
    const rows = await db.all(
        `SELECT id, holiday_date, title FROM school_holidays
          WHERE school_id = ? ORDER BY holiday_date`,
        user.school_id
    );
    return ok(rows.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "holidays.manage");
    const body = await readJson(request);
    requireFields(body, ["holiday_date", "title"]);

    if (!DATE_RE.test(body.holiday_date)) {
        throw errors.validation("تاریخ باید به فرمت YYYY-MM-DD باشد");
    }
    if (!body.title.trim()) throw errors.validation("عنوان تعطیلی الزامی است");
    requireMaxLength(body.title, 200, "عنوان تعطیلی");

    const db = q(env);
    const existing = await db.first(
        `SELECT id FROM school_holidays WHERE school_id = ? AND holiday_date = ?`,
        user.school_id, body.holiday_date
    );
    if (existing) throw errors.validation("برای این تاریخ قبلاً تعطیلی ثبت شده است");

    const result = await db.run(
        `INSERT INTO school_holidays (school_id, holiday_date, title) VALUES (?, ?, ?)`,
        user.school_id, body.holiday_date, body.title.trim()
    );

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "holiday.create",
        entityType: "school_holiday", entityId: result.meta.last_row_id,
        meta: { holiday_date: body.holiday_date, title: body.title.trim() }, request,
    });

    return created({ id: result.meta.last_row_id }, "تعطیلی ثبت شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "holidays.manage");
    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const row = await db.first(
        `SELECT * FROM school_holidays WHERE id = ? AND school_id = ?`,
        body.id, user.school_id
    );
    if (!row) throw errors.notFound("تعطیلی پیدا نشد");

    await db.run(`DELETE FROM school_holidays WHERE id = ?`, row.id);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "holiday.delete",
        entityType: "school_holiday", entityId: row.id, request,
    });

    return ok(null, "تعطیلی حذف شد");
});
