// GET  /api/teacher/question-templates            -> list available packs
// POST /api/teacher/question-templates { pack_id } -> copy every question in
//      that pack into the calling teacher's own bank (each one goes through
//      the exact same createQuestionRecord() as a manually-created question,
//      so it gets its own id/version/snapshot -- editing a template-derived
//      question afterwards works exactly like any other question).
import { authenticate, requirePermission } from "../_shared/auth.js";
import { getTeacherRecord } from "../_shared/ownership.js";
import { ok, errors } from "../_shared/response.js";
import { requireFields, readJson, withErrorHandling } from "../_shared/validate.js";
import { TEMPLATE_PACKS, getTemplatePack } from "../_shared/question-template-packs.js";
import { createQuestionRecord } from "./questions.js";

export const onRequestGet = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.view");
    return ok(TEMPLATE_PACKS.map(p => ({ id: p.id, name: p.name, description: p.description, question_count: p.questions.length })));
});

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user } = await authenticate(request, env);
    await requirePermission(env, user, "questions.create");
    const teacher = await getTeacherRecord(env, user.id);

    const body = await readJson(request);
    requireFields(body, ["pack_id"]);

    const pack = getTemplatePack(body.pack_id);
    if (!pack) throw errors.notFound("بستهٔ آماده پیدا نشد");

    const createdIds = [];
    for (const questionBody of pack.questions) {
        createdIds.push(await createQuestionRecord(env, { schoolId: user.school_id, teacherId: teacher.id, body: questionBody }));
    }

    return ok({ created_count: createdIds.length }, `${createdIds.length} سؤال از «${pack.name}» به بانک سؤال شما اضافه شد`);
});
