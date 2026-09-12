// POST /api/admin/moderate-question { question_id, action: 'approve'|'reject' }
import { q } from "../_shared/db.js";
import { authenticate, requirePermission } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.moderate");

    const body = await readJson(request);
    requireFields(body, ["question_id", "action"]);
    if (!["approve", "reject"].includes(body.action)) throw errors.validation("action باید approve یا reject باشد");

    const db = q(env);
    const question = await db.first(
        `SELECT id FROM questions WHERE id = ? AND school_id = ? AND visibility = 'pending' AND deleted_at IS NULL`,
        body.question_id, user.school_id
    );
    if (!question) throw errors.notFound("سؤالِ در انتظار تأیید پیدا نشد");

    const newVisibility = body.action === "approve" ? "public" : "private";
    await db.run(`UPDATE questions SET visibility = ? WHERE id = ?`, newVisibility, question.id);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id, action: "question.moderate",
        entityType: "question", entityId: question.id, meta: { decision: body.action, visibility: newVisibility }, request,
    });

    return ok({ visibility: newVisibility }, body.action === "approve" ? "سؤال تأیید و عمومی شد" : "سؤال رد شد");
});
