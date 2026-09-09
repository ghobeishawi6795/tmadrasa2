/* =========================================================
   app.js — shared page-shell bootstrap for every role page.
   Handles: auth guard, topbar profile, logout, tiny toast helper.
========================================================= */

let currentSession = null;

const ROLE_LABELS = {
    admin: "مدیر مدرسه",
    teacher: "معلم",
    student: "دانش‌آموز",
    parent: "والد",
};

/**
 * Call at the top of every role page's script.
 * Redirects to ../login.html if unauthenticated, and to the correct role
 * folder if the logged-in user's role doesn't match this page.
 * @param {string} expectedRole "admin" | "teacher" | "student" | "parent"
 */
function initShell(expectedRole) {
    currentSession = requireAuth();
    if (!currentSession) return null; // already redirected

    const roles = currentSession.roles || [];
    if (!roles.includes(expectedRole)) {
        // logged in, but with a different role -- send them to their own area
        const known = ["admin", "teacher", "student", "parent"];
        const theirRole = roles.find(r => known.includes(r)) || "student";
        window.location.href = `/${theirRole}/index.html`;
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
