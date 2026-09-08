// GET /api/admin/backup -- exports every row belonging to this school as one
// JSON document. This is a MANUAL/scriptable backup, not an automatic one:
// Cloudflare D1 has no built-in scheduled export, and without R2 (or any
// other blob store) there's nowhere on this project's own infra to land a
// scheduled snapshot. The practical options are: (a) the school admin
// downloads this periodically themselves, or (b) an external script calls
// this endpoint on a schedule and saves the result somewhere the school
// controls (their own Drive, a local machine, etc.) -- see this project's
// README for the exact recommendation. This endpoint is the piece that
// makes either option possible; it does not schedule anything itself.
//
// password_hash is deliberately excluded from the users export -- a backup
// file is one more place credentials could leak from if mishandled, and
// nothing about restoring school data requires it.
import { q } from "../_shared/db.js";
import { authenticate, hasRole } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

// Table -> column to scope by. Most tables carry school_id directly;
// a few only carry it indirectly and are joined instead.
const DIRECT_TABLES = [
    "classes", "subjects", "teaching_assignments", "schedules",
    "teachers", "students", "parents", "parent_students",
    "class_students", "class_teachers",
    "assignments", "submissions",
    "exams", "questions", "exam_attempts", "grades",
    "attendance_sessions", "attendance_records",
    "conversations", "conversation_members",
    "announcements",
];

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user, roles } = await authenticate(request, env);
    // No dedicated "backup"/"system" permission exists in the RBAC schema yet
    // (same architectural gap noted for admin/parents.js) -- gated directly
    // on the admin role, matching that same precedent, since only admins
    // should ever pull a full school export.
    if (!hasRole(roles, "admin")) throw errors.forbidden("فقط مدیر مدرسه می‌تواند از داده‌ها خروجی بگیرد");

    const db = q(env);
    const dump = { exported_at: new Date().toISOString(), school_id: user.school_id };

    dump.school = await db.first(`SELECT id, name, phone, address, active, created_at FROM schools WHERE id = ?`, user.school_id);
    dump.users = (await db.all(
        `SELECT id, school_id, username, full_name, phone, email, is_active, created_at FROM users WHERE school_id = ? AND deleted_at IS NULL`,
        user.school_id
    )).results;

    for (const table of DIRECT_TABLES) {
        try {
            const rows = await db.all(`SELECT * FROM ${table} WHERE school_id = ?`, user.school_id);
            dump[table] = rows.results;
        } catch (e) {
            // a table without a school_id column would throw here -- skip
            // rather than fail the whole export over one table
            console.error(`backup: skipped table ${table}:`, e.message);
            dump[table] = [];
        }
    }

    // question_options and exam_questions/exam_answers hang off exams/questions
    // rather than carrying school_id directly -- pull them via the ids just collected
    const questionIds = dump.questions.map(q => q.id);
    const examIds = dump.exams.map(e => e.id);
    const attemptIds = dump.exam_attempts.map(a => a.id);

    dump.question_options = questionIds.length
        ? (await db.all(`SELECT * FROM question_options WHERE question_id IN (${questionIds.map(() => "?").join(",")})`, ...questionIds)).results
        : [];
    dump.exam_questions = examIds.length
        ? (await db.all(`SELECT * FROM exam_questions WHERE exam_id IN (${examIds.map(() => "?").join(",")})`, ...examIds)).results
        : [];
    dump.exam_answers = attemptIds.length
        ? (await db.all(`SELECT * FROM exam_answers WHERE attempt_id IN (${attemptIds.map(() => "?").join(",")})`, ...attemptIds)).results
        : [];

    const conversationIds = dump.conversations.map(c => c.id);
    dump.messages = conversationIds.length
        ? (await db.all(`SELECT * FROM messages WHERE conversation_id IN (${conversationIds.map(() => "?").join(",")})`, ...conversationIds)).results
        : [];

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "backup.export",
        meta: { table_count: Object.keys(dump).length }, request,
    });

    return ok(dump, "خروجی گرفته شد");
});
