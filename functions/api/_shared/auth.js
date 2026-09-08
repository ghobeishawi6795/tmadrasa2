import { q } from "./db.js";
import { hashToken } from "./crypto.js";
import { errors } from "./response.js";

const SESSION_DAYS = 30;

// Reads Authorization: Bearer <token>, hashes it, and looks up the session.
// Returns { user, session, roles } on success, or throws a Response (401) on failure.
export async function authenticate(request, env) {
    const authHeader = request.headers.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) throw errors.unauthorized("توکن احراز هویت ارسال نشده است");

    const rawToken = match[1].trim();
    const tokenHash = await hashToken(rawToken);
    const db = q(env);

    const session = await db.first(
        `SELECT * FROM sessions WHERE token_hash = ?`, tokenHash
    );
    if (!session) throw errors.unauthorized("نشست معتبر نیست");
    if (session.revoked_at) throw errors.unauthorized("نشست باطل شده است");
    if (new Date(session.expires_at) < new Date()) throw errors.unauthorized("نشست منقضی شده است");

    const user = await db.first(
        `SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`, session.user_id
    );
    if (!user || !user.is_active) throw errors.unauthorized("کاربر فعال نیست");

    const roleRows = await db.all(
        `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
        user.id
    );
    const roles = roleRows.results.map(r => r.key);

    return { user, session, roles, schoolId: user.school_id };
}

export async function createSession(env, user, request) {
    const { generateToken } = await import("./crypto.js");
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const db = q(env);

    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await db.run(
        `INSERT INTO sessions (user_id, school_id, token_hash, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        user.id, user.school_id, tokenHash,
        request.headers.get("CF-Connecting-IP") || null,
        request.headers.get("User-Agent") || null,
        expiresAt
    );

    return { token: rawToken, expiresAt }; // raw token returned to client ONCE
}

export async function revokeSession(env, session) {
    const db = q(env);
    await db.run(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`, session.id);
}

// Throws 403 if the user doesn't have `permissionKey` via any of their roles.
export async function requirePermission(env, user, permissionKey) {
    const db = q(env);
    const row = await db.first(
        `SELECT 1
           FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = ? AND p.key = ?
          LIMIT 1`,
        user.id, permissionKey
    );
    if (!row) throw errors.forbidden(`دسترسی «${permissionKey}» را ندارید`);
}

export function hasRole(roles, roleKey) {
    return roles.includes(roleKey);
}
