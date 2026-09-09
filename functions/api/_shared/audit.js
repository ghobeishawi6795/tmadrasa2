// Append-only audit log for sensitive actions.
// Never allowed to break the calling request: any failure here is caught and
// logged to console only, so a full disk / bad JSON in `meta` never turns a
// successful business action into a 500 for the user.
import { q } from "./db.js";

/**
 * @param {object} env
 * @param {object} opts
 * @param {number|null} opts.schoolId
 * @param {number|null} opts.actorUserId
 * @param {string} opts.action        short dot.case verb, e.g. "student.create"
 * @param {string} [opts.entityType]  e.g. "student"
 * @param {number} [opts.entityId]
 * @param {object} [opts.meta]        small plain object, JSON-stringified; never put passwords/tokens in here
 * @param {Request} [opts.request]    used to pull the caller's IP if present
 */
export async function writeAudit(env, opts) {
    try {
        const db = q(env);
        const ip = opts.request ? (opts.request.headers.get("CF-Connecting-IP") || null) : null;
        await db.run(
            `INSERT INTO audit_log (school_id, actor_user_id, action, entity_type, entity_id, meta, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            opts.schoolId ?? null,
            opts.actorUserId ?? null,
            opts.action,
            opts.entityType ?? null,
            opts.entityId ?? null,
            opts.meta ? JSON.stringify(opts.meta) : null,
            ip
        );
    } catch (e) {
        // Audit logging is best-effort. Never let it fail the real request.
        console.error("audit log write failed:", e);
    }
}
