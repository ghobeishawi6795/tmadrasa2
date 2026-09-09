/* =========================================================
   api.js — shared frontend API client for مدرسه (Madrese)
   Handles: session storage, authenticated fetch, 401 redirect
========================================================= */

const SESSION_KEY = "madrese_session";

/** Reads the current session ({ token, expires_at, user, roles }) or null. */
function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

/**
 * Redirects to login.html if there's no session. Call at the top of every
 * protected page. Returns the session so callers can use it immediately.
 */
function requireAuth() {
    const session = getSession();
    if (!session || !session.token) {
        window.location.href = "/login.html";
        return null;
    }
    return session;
}

/**
 * Authenticated fetch wrapper.
 * - Adds Authorization header automatically.
 * - Parses JSON and throws an Error with the server message on failure.
 * - On 401 (invalid/expired session), clears storage and redirects to login.
 *
 * @param {string} path   e.g. "/api/admin/students"
 * @param {object} [opts] { method, body } -- body is auto-JSON-stringified
 */
async function apiFetch(path, opts = {}) {
    const session = getSession();
    const headers = { "Content-Type": "application/json" };
    if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;

    let res;
    try {
        res = await fetch(path, {
            method: opts.method || "GET",
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
    } catch (e) {
        throw new Error("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
    }

    if (res.status === 401) {
        clearSession();
        window.location.href = "/login.html";
        // Throw so callers' .then chains stop here too (redirect is async).
        throw new Error("نشست شما منقضی شده است");
    }

    let json = null;
    try { json = await res.json(); } catch { /* empty body, e.g. some 204s */ }

    if (!res.ok || (json && json.success === false)) {
        const message = json?.error?.message || "خطایی رخ داد";
        throw new Error(message);
    }

    return json ? json.data : null;
}

const api = {
    get: (path) => apiFetch(path, { method: "GET" }),
    post: (path, body) => apiFetch(path, { method: "POST", body }),
    put: (path, body) => apiFetch(path, { method: "PUT", body }),
    patch: (path, body) => apiFetch(path, { method: "PATCH", body }),
    del: (path, body) => apiFetch(path, { method: "DELETE", body }),
};

async function login(schoolId, username, password) {
    const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { school_id: Number(schoolId), username, password },
    });
    setSession({ token: data.token, expires_at: data.expires_at, user: data.user, roles: data.roles });
    return data;
}

async function logout() {
    try {
        await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
        // even if the network call fails, still clear the local session
    }
    clearSession();
    window.location.href = "/login.html";
}
