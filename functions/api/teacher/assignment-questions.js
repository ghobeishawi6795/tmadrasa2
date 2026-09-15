// /api/teacher/assignment-questions -- read-only listing of a multi-question
// assignment's questions (full rows, including the answer-key question_payload
// for match/drag_drop sub-questions). Currently only used by the teacher-side
// "پیش‌نمایش تکلیف" preview feature -- multi-question assignments themselves
// are only ever created in bulk by teacher/import-html.js, so there's no
// attach/detach/reorder need here the way exam-questions.js has.
// GET -> list questions for one assignment { assignment_id } (query string)
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord, loadAssignmentOwnedByTeacher } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "assignments.view");
    const teacher = await getTeacherRecord(env, user.id, user.school_id);

    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignment_id");
    if (!assignmentId) throw errors.validation("assignment_id لازم است");
    const assignment = await loadAssignmentOwnedByTeacher(env, assignmentId, teacher.id, user.school_id);

    const db = q(env);
    const rows = await db.all(
        `SELECT * FROM assignment_questions WHERE assignment_id = ? ORDER BY order_index ASC`,
        assignment.id
    );
    return ok(rows.results);
});
