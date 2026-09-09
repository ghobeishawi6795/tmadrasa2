// /api/teacher/attendance
// POST { action: "create_session", class_id, session_date }
// POST { action: "mark", session_id, records: [{student_id, status}] }
// GET  ?class_id=123                -> list sessions for a class
// GET  ?session_id=123              -> one session + all student records
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, assertClassOwnedByTeacher, assertStudentInClass } from "../_shared/ownership.js";
import { ok, created, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { notifyUsers } from "../_shared/notify.js";

const VALID_STATUSES = ["present", "absent", "late", "excused"];

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "attendance.view");
    const teacher = await getTeacherRecord(env, user.id);
    const db = q(env);
    const url = new URL(request.url);

    const sessionId = url.searchParams.get("session_id");
    if (sessionId) {
        const session = await db.first(
            `SELECT * FROM attendance_sessions WHERE id = ? AND school_id = ?`,
            sessionId, user.school_id
        );
        if (!session) throw errors.notFound("جلسه پیدا نشد");
        if (session.teacher_id !== teacher.id) throw errors.forbidden("این جلسه متعلق به شما نیست");

        const records = await db.all(
            `SELECT ar.*, u.full_name FROM attendance_records ar
               JOIN students s ON s.id = ar.student_id
               JOIN users u ON u.id = s.user_id
              WHERE ar.session_id = ?
              ORDER BY u.full_name`,
            session.id
        );
        return ok({ session, records: records.results });
    }

    const classId = url.searchParams.get("class_id");
    if (!classId) throw errors.validation("class_id یا session_id الزامی است");
    await assertClassOwnedByTeacher(env, classId, teacher.id, user.school_id);

    const sessions = await db.all(
        `SELECT * FROM attendance_sessions WHERE class_id = ? AND school_id = ? ORDER BY session_date DESC`,
        classId, user.school_id
    );
    return ok(sessions.results);
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    const teacher = await getTeacherRecord(env, user.id);
    const db = q(env);
    const body = await readJson(request);
    requireFields(body, ["action"]);

    if (body.action === "create_session") {
        await requirePermission(env, user, "attendance.create");
        requireFields(body, ["class_id", "session_date"]);
        await assertClassOwnedByTeacher(env, body.class_id, teacher.id, user.school_id);

        const existing = await db.first(
            `SELECT id FROM attendance_sessions WHERE class_id = ? AND session_date = ?`,
            body.class_id, body.session_date
        );
        if (existing) return ok({ session_id: existing.id }, "جلسه همین روز قبلاً ساخته شده بود");

        const result = await db.run(
            `INSERT INTO attendance_sessions (school_id, class_id, teacher_id, session_date)
             VALUES (?, ?, ?, ?)`,
            user.school_id, body.class_id, teacher.id, body.session_date
        );

        // pre-fill "present" for every enrolled student so the teacher only edits exceptions
        const roster = await db.all(
            `SELECT student_id FROM class_students WHERE class_id = ? AND school_id = ?`,
            body.class_id, user.school_id
        );
        if (roster.results.length) {
            await db.batch(roster.results.map(r => ({
                sql: `INSERT INTO attendance_records (session_id, student_id, school_id, status) VALUES (?, ?, ?, 'present')`,
                params: [result.meta.last_row_id, r.student_id, user.school_id],
            })));
        }

        return created({ session_id: result.meta.last_row_id }, "جلسه حضور و غیاب ساخته شد");
    }

    if (body.action === "mark") {
        await requirePermission(env, user, "attendance.update");
        requireFields(body, ["session_id", "records"]);

        const session = await db.first(
            `SELECT * FROM attendance_sessions WHERE id = ? AND school_id = ?`,
            body.session_id, user.school_id
        );
        if (!session) throw errors.notFound("جلسه پیدا نشد");
        if (session.teacher_id !== teacher.id) throw errors.forbidden("این جلسه متعلق به شما نیست");

        if (!Array.isArray(body.records) || body.records.length === 0) {
            throw errors.validation("records نباید خالی باشد");
        }

        const statements = [];
        for (const rec of body.records) {
            if (!VALID_STATUSES.includes(rec.status)) {
                throw errors.validation(`وضعیت «${rec.status}» نامعتبر است`);
            }
            // never trust student_id blindly — must actually belong to this class/school
            await assertStudentInClass(env, rec.student_id, session.class_id, user.school_id);
            statements.push({
                sql: `INSERT INTO attendance_records (session_id, student_id, school_id, status)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status`,
                params: [session.id, rec.student_id, user.school_id, rec.status],
            });
        }
        await db.batch(statements);

        // notify parents of any student marked absent in this batch
        const absentIds = body.records.filter(r => r.status === "absent").map(r => r.student_id);
        if (absentIds.length) {
            const placeholders = absentIds.map(() => "?").join(",");
            const parents = await db.all(
                `SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id
                  WHERE ps.student_id IN (${placeholders}) AND ps.school_id = ?`,
                ...absentIds, user.school_id
            );
            await notifyUsers(env, user.school_id, parents.results.map(p => p.user_id),
                "attendance_absent", "غیبت ثبت شد", `تاریخ: ${session.session_date}`);
        }

        return ok(null, "حضور و غیاب ثبت شد");
    }

    throw errors.validation("action نامعتبر است");
});
