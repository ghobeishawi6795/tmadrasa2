// POST /api/auth/logout
import { authenticate, revokeSession } from "../_shared/auth.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestPost = withErrorHandling(async ({ request, env }) => {
    const { user, session } = await authenticate(request, env);
    await revokeSession(env, session);

    await writeAudit(env, {
        schoolId: user.school_id, actorUserId: user.id,
        action: "auth.logout", entityType: "session", entityId: session.id, request,
    });

    return ok(null, "خروج انجام شد");
});
