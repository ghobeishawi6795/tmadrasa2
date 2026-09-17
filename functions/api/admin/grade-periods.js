// /api/admin/grade-periods -- CRUD for grade_periods ("نوبت اول/دوم" etc).
// This table has existed since migration 007 and is already read everywhere
// (grade sync, parent/student report-card filtering -- see
// _shared/grades-sync.js) but until now had NO endpoint anywhere that could
// ever create a row in it, so grade_period_id was always NULL on every
// grade and the whole per-term filter was structurally unreachable. This
// file is that missing piece.
//
// start_at/end_at are stored with an explicit time-of-day (00:00:00 /
// 23:59:59) rather than bare dates, so a period's last day is fully
// included when compared against datetime('now') in grades-sync.js --
// storing a bare "2026-01-30" for end_at would mean the period effectively
// ends at midnight AT THE START of that day, excluding grades entered
// during Jan 30 itself.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, created, errors } from "../_shared/response.js";
import { readJson, requireFields, requireMaxLength, withErrorHandling } from "../_shared/validate.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidRange(startDate, endDate) {
    if (!DATE_RE.test(String(startDate))) throw errors.validation("تاریخ شروع نامعتبر است");
    if (!DATE_RE.test(String(endDate))) throw errors.validation("تاریخ پایان نامعتبر است");
    if (String(startDate) >= String(endDate)) throw errors.validation("تاریخ شروع باید قبل از پایان باشد");
}

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grade_periods.view");
    const db = q(env);
    const r = await db.all(
        `SELECT * FROM grade_periods WHERE school_id = ? ORDER BY start_at DESC`,
        user.school_id
    );
    return ok(r.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grade_periods.manage");
    const db = q(env);
    const b = await readJson(request);
    requireFields(b, ["name", "start_date", "end_date"]);
    if (typeof b.name !== "string" || !b.name.trim()) throw errors.validation("نام دوره الزامی است");
    requireMaxLength(b.name, 100, "نام دوره");
    assertValidRange(b.start_date, b.end_date);

    // Periods aren't required to be disjoint by the schema, but an overlap
    // makes "which period is this grade in" ambiguous (grades-sync.js just
    // picks whichever started most recently), so it's caught here instead.
    const overlap = await db.first(
        `SELECT id FROM grade_periods WHERE school_id = ? AND date(start_at) <= date(?) AND date(end_at) >= date(?)`,
        user.school_id, b.end_date, b.start_date
    );
    if (overlap) throw errors.validation("این بازه با یک دوره‌ی دیگر همپوشانی دارد");

    const r = await db.run(
        `INSERT INTO grade_periods (school_id, name, start_at, end_at) VALUES (?, ?, ?, ?)`,
        user.school_id, b.name.trim(), `${b.start_date} 00:00:00`, `${b.end_date} 23:59:59`
    );
    return created({ id: r.meta.last_row_id }, "دوره ساخته شد");
});

export const onRequestPatch = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grade_periods.manage");
    const db = q(env);
    const b = await readJson(request);
    requireFields(b, ["id"]);
    const row = await db.first(`SELECT * FROM grade_periods WHERE id = ? AND school_id = ?`, b.id, user.school_id);
    if (!row) throw errors.notFound("دوره پیدا نشد");

    if (b.name !== undefined && (typeof b.name !== "string" || !b.name.trim())) throw errors.validation("نام دوره الزامی است");
    if (b.name !== undefined) requireMaxLength(b.name, 100, "نام دوره");

    const startDate = b.start_date !== undefined ? String(b.start_date) : row.start_at.slice(0, 10);
    const endDate = b.end_date !== undefined ? String(b.end_date) : row.end_at.slice(0, 10);
    assertValidRange(startDate, endDate);

    const overlap = await db.first(
        `SELECT id FROM grade_periods WHERE school_id = ? AND id <> ? AND date(start_at) <= date(?) AND date(end_at) >= date(?)`,
        user.school_id, row.id, endDate, startDate
    );
    if (overlap) throw errors.validation("این بازه با یک دوره‌ی دیگر همپوشانی دارد");

    const name = b.name !== undefined ? b.name.trim() : row.name;
    await db.run(
        `UPDATE grade_periods SET name = ?, start_at = ?, end_at = ? WHERE id = ? AND school_id = ?`,
        name, `${startDate} 00:00:00`, `${endDate} 23:59:59`, row.id, user.school_id
    );
    return ok(null, "دوره بروزرسانی شد");
});

export const onRequestDelete = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "grade_periods.manage");
    const db = q(env);
    const b = await readJson(request);
    requireFields(b, ["id"]);
    const row = await db.first(`SELECT id FROM grade_periods WHERE id = ? AND school_id = ?`, b.id, user.school_id);
    if (!row) throw errors.notFound("دوره پیدا نشد");

    // grade_period_id is a nullable reference on `grades` -- detach any
    // grades already tagged with this period before removing it, rather
    // than leaving them pointing at a row that no longer exists.
    await db.batch([
        { sql: `UPDATE grades SET grade_period_id = NULL WHERE grade_period_id = ? AND school_id = ?`, params: [row.id, user.school_id] },
        { sql: `DELETE FROM grade_periods WHERE id = ? AND school_id = ?`, params: [row.id, user.school_id] },
    ]);
    return ok(null, "دوره حذف شد");
});
