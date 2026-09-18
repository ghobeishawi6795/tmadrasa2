// GET /api/public/settings -- intentionally NO authenticate() call.
// This is the one endpoint in the whole app that's truly public: the
// frontend needs to know whether to store the session in localStorage
// (persistent) or sessionStorage (per-tab) BEFORE a login even happens,
// so it can't be gated behind a login. Keep this file to non-sensitive,
// read-only, boolean-ish settings only -- never put anything school- or
// user-specific here.
import { q } from "../_shared/db.js";
import { ok } from "../_shared/response.js";
import { withErrorHandling } from "../_shared/validate.js";

export const onRequestGet = withErrorHandling(async ({ env }) => {
    const db = q(env);
    const row = await db.first(`SELECT value FROM system_settings WHERE key = 'persistent_login'`);
    return ok({ persistent_login: row ? row.value === "1" : true });
});
