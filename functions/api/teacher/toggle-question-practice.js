// POST /api/teacher/toggle-question-practice  { id }
// Marks/unmarks a bank question as available in the student "تمرین"
// (practice) view. Deliberately bypasses questions.js's PUT so toggling
// this never bumps the question's version (see 018_question_versions.sql),
// same reasoning as toggle-question-favorite.js.
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.update");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["id"]);

    const db = q(env);
    const question = await db.first(
        `SELECT id, teacher_id, is_practice FROM questions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        body.id, user.school_id
    );
    if (!question) throw errors.notFound("سؤال پیدا نشد");
    if (question.teacher_id !== teacher.id) throw errors.forbidden("این سؤال متعلق به شما نیست");

    const newValue = question.is_practice ? 0 : 1;
    await db.run(`UPDATE questions SET is_practice = ? WHERE id = ?`, newValue, question.id);
    return ok({ is_practice: !!newValue });
});
