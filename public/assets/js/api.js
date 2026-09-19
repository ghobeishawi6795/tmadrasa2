/* =========================================================
   api.js — shared frontend API client for مدرسه (Madrese)
   Handles: session storage, authenticated fetch, 401 redirect
========================================================= */

const SESSION_KEY = "madrese_session";
const PERSISTENT_LOGIN_CACHE_KEY = "madrese_persistent_login";

/**
 * Whether the active session survives a full browser/app close.
 * - true  (localStorage) -- default. Log in once, stay logged in on this
 *   device until you explicitly log out or the 30-day server session
 *   expires. Superadmin-controlled system-wide (GET/PATCH
 *   /api/superadmin/settings), user-facing 2026-09-18 per request.
 * - false (sessionStorage, the old default) -- per-TAB: lets you have e.g.
 *   the teacher dashboard open in one tab and the student dashboard in
 *   another, each independently logged in, at the cost of needing to log
 *   in again in every freshly opened tab.
 *
 * The setting itself is fetched from /api/public/settings (no auth needed,
 * since this decision has to be made before/at login) and cached in
 * localStorage so page loads don't block on a network round-trip just to
 * find the right storage to look in.
 */
function isPersistentLoginCached() {
    const cached = localStorage.getItem(PERSISTENT_LOGIN_CACHE_KEY);
    return cached === null ? true : cached === "1"; // default true until first fetch completes
}

function cachePersistentLoginSetting(enabled) {
    try { localStorage.setItem(PERSISTENT_LOGIN_CACHE_KEY, enabled ? "1" : "0"); } catch { /* storage full/disabled */ }
}

/** Refreshes the cached setting from the server. Fire-and-forget; call at app start and before login. */
async function refreshPersistentLoginSetting() {
    try {
        const res = await fetch("/api/public/settings");
        const json = await res.json();
        if (json?.success) cachePersistentLoginSetting(!!json.data.persistent_login);
    } catch { /* offline/etc -- keep using the cached value */ }
}

/** Reads the current session ({ token, expires_at, user, roles }) or null. Checks both storages so a session written under either mode is still found (e.g. right after the setting was flipped). */
function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setSession(session) {
    const json = JSON.stringify(session);
    if (isPersistentLoginCached()) {
        localStorage.setItem(SESSION_KEY, json);
        sessionStorage.removeItem(SESSION_KEY);
    } else {
        sessionStorage.setItem(SESSION_KEY, json);
        localStorage.removeItem(SESSION_KEY);
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Multi-account switcher storage (see account-switcher.js for the UI).
 * Unlike the per-tab sessionStorage session above, this list lives in
 * localStorage on purpose: it's the "saved logins" shelf that must survive
 * across tabs and browser restarts so switching between e.g. an admin
 * account and a teacher account never needs the password typed again,
 * the same way Instagram/WhatsApp account-switching works. Only the raw
 * session tokens live here (same tokens the server already issues and can
 * revoke/expire normally) -- no passwords are ever stored.
 */
const ACCOUNTS_KEY = "madrese_accounts_v1";

function getAccounts() {
    try {
        const raw = localStorage.getItem(ACCOUNTS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveAccounts(list) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch { /* storage full/disabled -- switcher just won't persist */ }
}

function accountKey(user) {
    return `${user.school_id}:${user.id}`;
}

/** Upserts a logged-in session into the saved-accounts list, keyed by school_id+user_id so logging into the same account again just refreshes it in place. */
function upsertAccount(session) {
    if (!session || !session.token || !session.user) return;
    const key = accountKey(session.user);
    const list = getAccounts().filter(a => a.key !== key);
    list.push({
        key,
        token: session.token,
        expires_at: session.expires_at,
        user: session.user,
        roles: session.roles,
        saved_at: new Date().toISOString(),
    });
    saveAccounts(list);
}

function removeAccountByKey(key) {
    saveAccounts(getAccounts().filter(a => a.key !== key));
}

/** Used when a session turns out to be dead (401) so the switcher stops offering it. */
function removeAccountByToken(token) {
    if (!token) return;
    saveAccounts(getAccounts().filter(a => a.token !== token));
}

/**
 * Cross-tab identity sync. With persistent login (localStorage) the ACTIVE session is
 * shared by every open tab of the site. Without this, switching account (or logging out)
 * in one tab leaves the other tabs painted for the OLD account while every request they
 * make silently authenticates as the NEW one -- i.e. the user could send a message, publish
 * an exam, etc. as a different account than the one on screen. When another tab changes
 * the active session to a different account (or clears it), reload this tab so its UI and
 * its identity agree again (page guards then route to the right dashboard / login).
 * Pages with no bound account (login pages) are left alone.
 */
const __pageAccountKey = (() => {
    const s = getSession();
    return s && s.user ? accountKey(s.user) : null;
})();
window.addEventListener("storage", (e) => {
    if (e.storageArea !== localStorage) return;
    if (e.key !== null && e.key !== SESSION_KEY) return; // key === null means localStorage.clear()
    if (__pageAccountKey === null) return;
    const s = getSession();
    if (!s || !s.user || accountKey(s.user) !== __pageAccountKey) window.location.reload();
});

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

/** Path to the right login page for a given session's roles -- the super-admin area has its own (see superadmin/login.html). */
function loginPathFor(session) {
    return (session?.roles || []).includes("super_admin") ? "/superadmin/login.html" : "/login.html";
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
        const loginPath = loginPathFor(session);
        if (session?.token && path !== "/api/auth/login") removeAccountByToken(session.token);
        clearSession();
        window.location.href = loginPath;
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

async function login(schoolId, username, password, twoFactorCode = null) {
    const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { school_id: Number(schoolId), username, password, ...(twoFactorCode ? { two_factor_code: twoFactorCode } : {}) },
    });
    if (data?.token) {
        const session = { token: data.token, expires_at: data.expires_at, user: data.user, roles: data.roles };
        setSession(session);
        upsertAccount(session);
    }
    return data;
}

async function logout() {
    const session = getSession();
    const loginPath = loginPathFor(session);
    try {
        await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
        // even if the network call fails, still clear the local session
    }
    if (session?.user) removeAccountByKey(accountKey(session.user));
    clearSession();
    window.location.href = loginPath;
}
