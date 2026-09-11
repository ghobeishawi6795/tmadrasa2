/* =========================================================
   app.js — shared page-shell bootstrap for every role page.
   Handles: auth guard, topbar profile, logout, tiny toast helper.
========================================================= */

let currentSession = null;

/**
 * Escapes a value for safe insertion into innerHTML as text content.
 * Use for ANY user-supplied string (names, titles, messages, feedback,
 * holiday titles, subject names, etc.) before it goes into a template
 * literal that gets assigned to innerHTML. Non-string input is coerced
 * to a string first so it's always safe to call.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Safely JSON-encodes a value for embedding inside an HTML attribute that
 * will be parsed back with JSON.parse (e.g. onclick="doThing(${escapeAttr(obj)})"
 * used as onclick='doThing(JSON.parse(this.dataset.x))' via data-* attributes,
 * or directly inside a double-quoted attribute). Escapes double quotes and
 * HTML-significant characters so embedding never breaks the surrounding
 * markup, regardless of what the underlying strings contain.
 */
function escapeAttr(value) {
    return JSON.stringify(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const ROLE_LABELS = {
    admin: "مدیر مدرسه",
    teacher: "معلم",
    student: "دانش‌آموز",
    parent: "والد",
    super_admin: "سوپرادمین",
};

// role key -> URL folder name (only super_admin differs, folder is "superadmin")
const ROLE_FOLDERS = {
    admin: "admin", teacher: "teacher", student: "student", parent: "parent",
    super_admin: "superadmin",
};

/**
 * Call at the top of every role page's script.
 * Redirects to ../login.html if unauthenticated, and to the correct role
 * folder if the logged-in user's role doesn't match this page.
 * @param {string} expectedRole "admin" | "teacher" | "student" | "parent"
 */
function initShell(expectedRole) {
    // The super-admin area has its own dedicated login page (no school-id
    // field, since a super-admin isn't attached to any real school) --
    // don't bounce it through the generic /login.html like the other 4 roles.
    if (expectedRole === "super_admin") {
        const session = getSession();
        if (!session || !session.token) {
            window.location.href = "/superadmin/login.html";
            return null;
        }
        currentSession = session;
    } else {
        currentSession = requireAuth();
        if (!currentSession) return null; // already redirected
    }

    const roles = currentSession.roles || [];
    if (!roles.includes(expectedRole)) {
        // logged in, but with a different role -- send them to their own area
        const known = ["admin", "teacher", "student", "parent", "super_admin"];
        const theirRole = roles.find(r => known.includes(r)) || "student";
        window.location.href = `/${ROLE_FOLDERS[theirRole] || theirRole}/index.html`;
        return null;
    }

    const name = currentSession.user?.full_name || ROLE_LABELS[expectedRole];
    document.getElementById("roleName").textContent = ROLE_LABELS[expectedRole];
    document.getElementById("profileName").textContent = name;
    document.getElementById("profileRole").textContent = ROLE_LABELS[expectedRole];
    document.getElementById("avatar").textContent = name.charAt(0);

    applyBranding(); // fire-and-forget: cosmetic only, never blocks the shell

    return currentSession;
}

/**
 * Fetches this school's branding (logo/color/name) and paints it into the
 * shared header -- runs on every role page since /api/school/branding is
 * available to any authenticated user (see that endpoint's own comment).
 * Failure is silent: branding is cosmetic, not load-bearing.
 */
async function applyBranding() {
    try {
        const branding = await api.get("/api/school/branding");
        if (branding.primary_color) {
            document.documentElement.style.setProperty("--primary", branding.primary_color);
            document.documentElement.style.setProperty("--primary-soft", lightenColor(branding.primary_color, 0.88));
        }
        if (branding.logo_data) {
            document.querySelectorAll(".logo-icon").forEach(el => {
                el.style.background = "none";
                el.innerHTML = `<img src="${branding.logo_data}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">`;
            });
        }
        if (branding.name) {
            document.querySelectorAll(".logo strong").forEach(el => { el.textContent = branding.name; });
        }
    } catch {
        // ignore -- e.g. offline or endpoint hiccup, keep default branding
    }
}

/** Lightens a #rrggbb color toward white by `amount` (0-1); used to derive a "soft" tint from the admin's single chosen primary color. */
function lightenColor(hex, amount) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
    const mix = (ch) => Math.round(ch + (255 - ch) * amount);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * Mounts a teacher-imported question's original HTML (colors/layout/icons --
 * whatever the AI-generated file looked like) inside `container`, in a
 * fully sandboxed <iframe> so nothing in it can run: `sandbox=""` blocks
 * script execution, form submission, top-level navigation and popups, and
 * the iframe gets its own opaque origin (no access to this page's session
 * or storage even if something in the imported HTML tried). This is
 * intentionally NOT a general-purpose HTML sanitizer -- the sandbox is what
 * makes embedding fairly permissive HTML/CSS safe. Height is fixed with
 * internal scrolling rather than measured from the iframe's content,
 * because a sandboxed iframe without "allow-same-origin" can't be
 * introspected from the parent page (that's the security boundary working
 * as intended, not a bug to work around).
 * @param {HTMLElement} container empty element to mount into
 * @param {string|null} styleBlock shared <style> content for this assignment (or null)
 * @param {string|null} blockHtml this question's sanitized original HTML block (or null)
 */
function mountPromptFrame(container, styleBlock, blockHtml) {
    if (!container || !blockHtml) return;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "");
    iframe.style.cssText = "width:100%;height:260px;border:0;border-radius:10px;background:#fff;display:block";
    container.innerHTML = "";
    container.appendChild(iframe);
    iframe.srcdoc = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
        <style>body{margin:0;padding:12px;font-family:inherit;overflow:auto}</style>
        <style>${styleBlock || ""}</style>
        </head><body>${blockHtml}</body></html>`;
}

function toast(message, isError = false) {
    let box = document.getElementById("__toast");
    if (!box) {
        box = document.createElement("div");
        box.id = "__toast";
        box.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:500;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.15);transition:opacity .3s;";
        document.body.appendChild(box);
    }
    box.style.background = isError ? "#ffeded" : "#e9faf4";
    box.style.color = isError ? "#ef5350" : "#20b486";
    box.textContent = message;
    box.style.opacity = "1";
    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => { box.style.opacity = "0"; }, 3000);
}

/** Wraps an async action (e.g. a form submit) with a try/catch that toasts errors. */
async function withToast(fn, successMessage) {
    try {
        const result = await fn();
        if (successMessage) toast(successMessage);
        return result;
    } catch (e) {
        toast(e.message || "خطایی رخ داد", true);
        throw e;
    }
}
