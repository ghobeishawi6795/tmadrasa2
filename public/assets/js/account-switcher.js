/* =========================================================
   account-switcher.js — multi-account switcher (Instagram/WhatsApp style)
   The data layer (getAccounts/upsertAccount/removeAccountByKey/...) lives
   in api.js since login()/logout() there need it too and it's loaded on
   the login pages as well. This file is the UI on top of it: a dropdown
   anchored to the topbar's .profile block, and an "add account" modal.

   Mounted by initShell() (see app.js) right after it paints the topbar
   profile block -- no per-page HTML changes needed beyond including this
   script tag; any page with the standard .profile block gets it for free.
========================================================= */

const SWITCHER_ROLE_LABELS = { admin: "مدیر مدرسه", teacher: "معلم", student: "دانش‌آموز", parent: "والد", super_admin: "سوپرادمین" };
const SWITCHER_ROLE_FOLDERS = { admin: "admin", teacher: "teacher", student: "student", parent: "parent", super_admin: "superadmin" };

function switcherRoleHome(roles) {
    const known = Object.keys(SWITCHER_ROLE_FOLDERS);
    const role = (roles || []).find(r => known.includes(r)) || "student";
    return `/${SWITCHER_ROLE_FOLDERS[role]}/index.html`;
}

function switcherPrimaryRoleLabel(roles) {
    const known = Object.keys(SWITCHER_ROLE_LABELS);
    const role = (roles || []).find(r => known.includes(r));
    return role ? SWITCHER_ROLE_LABELS[role] : "کاربر";
}

let __switcherStylesInjected = false;
function injectSwitcherStyles() {
    if (__switcherStylesInjected) return;
    __switcherStylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
        .acc-dropdown{position:absolute;top:calc(100% + 10px);inset-inline-end:0;width:290px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 16px 45px rgba(20,25,45,.16);z-index:200;display:none;overflow:hidden}
        .acc-dropdown.show{display:block}
        .acc-dropdown-head{padding:14px 16px 8px;font-size:11px;font-weight:700;color:var(--muted)}
        .acc-row{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer}
        .acc-row:hover{background:var(--surface2)}
        .acc-row.active{background:var(--primary-soft)}
        .acc-row .avatar{width:34px;height:34px;border-radius:11px;font-size:13px;flex-shrink:0}
        .acc-row-info{flex:1;min-width:0}
        .acc-row-name{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .acc-row-role{font-size:10.5px;color:var(--muted)}
        .acc-row-check{color:var(--primary);font-size:14px}
        .acc-row-remove{border:0;background:transparent;color:var(--muted);font-size:15px;padding:4px;border-radius:6px;line-height:1}
        .acc-row-remove:hover{background:var(--red-soft,#ffeded);color:var(--red,#ef5350)}
        .acc-dropdown-sep{border-top:1px solid var(--line);margin:4px 0}
        .acc-dropdown-action{display:flex;align-items:center;gap:8px;padding:12px 16px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--text)}
        .acc-dropdown-action:hover{background:var(--surface2)}
        .acc-dropdown-action.danger{color:var(--red,#ef5350)}
        .profile[data-acc-trigger]{cursor:pointer;user-select:none}
        .profile-caret{font-size:9px;color:var(--muted);margin-inline-start:2px}
    `;
    document.head.appendChild(style);
}

/**
 * Direct call to /api/auth/login, deliberately NOT via api.js's apiFetch/login():
 * apiFetch treats any 401 as "this tab's active session died" and force-clears
 * it + redirects to the login page -- which would be catastrophic here, since
 * a wrong password for the NEW account being added is an expected, routine
 * 401 and must never touch the account the user is already using in this tab.
 */
async function rawAccountLogin(schoolId, username, password, twoFactorCode) {
    let res;
    try {
        res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ school_id: Number(schoolId), username, password, ...(twoFactorCode ? { two_factor_code: twoFactorCode } : {}) }),
        });
    } catch {
        throw new Error("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
    }
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    if (!res.ok || (json && json.success === false)) {
        throw new Error(json?.error?.message || "ورود ناموفق بود");
    }
    return json.data;
}

/** Builds the (initially hidden) "add account" modal, appended once to <body> with its own element ids so it never collides with any page-local #modalOverlay. */
function ensureAddAccountModal() {
    if (document.getElementById("switcherModalOverlay")) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "switcherModalOverlay";
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-head">
                <div class="modal-title">افزودن حساب</div>
                <button class="close" type="button" id="switcherModalClose">✕</button>
            </div>
            <form id="switcherLoginForm">
                <div class="form-group"><label>شناسه مدرسه</label><input class="form-input" type="number" id="swSchoolId" required></div>
                <div class="form-group"><label>نام کاربری</label><input class="form-input" type="text" id="swUsername" required autocomplete="username"></div>
                <div class="form-group"><label>رمز عبور</label><input class="form-input" type="password" id="swPassword" required autocomplete="current-password"></div>
                <div class="form-group" id="swTwoFactorBox" style="display:none">
                    <label>کد ۶ رقمی ورود دومرحله‌ای</label>
                    <input class="form-input" id="swTwoFactorCode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}">
                </div>
                <div id="swError" style="display:none;color:var(--red,#ef5350);font-size:12.5px;margin-top:4px"></div>
                <div class="modal-footer">
                    <button type="submit" class="primary-btn" id="swSubmitBtn">ورود</button>
                    <button type="button" class="secondary-btn" id="switcherModalCancel">انصراف</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
        overlay.classList.remove("show");
        document.getElementById("switcherLoginForm").reset();
        document.getElementById("swTwoFactorBox").style.display = "none";
        document.getElementById("swError").style.display = "none";
        const btn = document.getElementById("swSubmitBtn");
        btn.disabled = false; btn.textContent = "ورود";
    };
    document.getElementById("switcherModalClose").onclick = close;
    document.getElementById("switcherModalCancel").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    document.getElementById("switcherLoginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const schoolId = document.getElementById("swSchoolId").value;
        const username = document.getElementById("swUsername").value.trim();
        const password = document.getElementById("swPassword").value;
        const code = document.getElementById("swTwoFactorCode").value.trim();
        const btn = document.getElementById("swSubmitBtn");
        const errBox = document.getElementById("swError");
        errBox.style.display = "none";
        btn.disabled = true; btn.textContent = "در حال ورود...";
        try {
            let data = await rawAccountLogin(schoolId, username, password, code || null);
            if (data.requires_2fa) {
                document.getElementById("swTwoFactorBox").style.display = "block";
                btn.disabled = false; btn.textContent = "تأیید کد";
                if (!code) return;
                data = await rawAccountLogin(schoolId, username, password, code);
            }
            upsertAccount({ token: data.token, expires_at: data.expires_at, user: data.user, roles: data.roles });
            overlay.classList.remove("show");
            // Instagram-style: adding an account switches straight into it.
            switchToAccount(accountKey(data.user));
        } catch (err) {
            errBox.textContent = err.message || "ورود ناموفق بود";
            errBox.style.display = "block";
            btn.disabled = false; btn.textContent = "ورود";
        }
    });
}

function switchToAccount(key) {
    const acc = getAccounts().find(a => a.key === key);
    if (!acc) return;
    setSession({ token: acc.token, expires_at: acc.expires_at, user: acc.user, roles: acc.roles });
    window.location.href = switcherRoleHome(acc.roles);
}

/** Revokes (server-side, best-effort) + removes (local list) one saved account. Safe to call on the currently-active one too -- that's an explicit "log out of this device's saved account", not just switching away. */
async function removeSwitcherAccount(key) {
    const acc = getAccounts().find(a => a.key === key);
    if (!acc) return;
    try {
        await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${acc.token}` } });
    } catch {
        // ignore -- still remove locally even if the network call failed
    }
    removeAccountByKey(key);
    const active = getSession();
    if (active && active.token === acc.token) {
        clearSession();
        window.location.href = "/login.html";
        return;
    }
    renderAccountDropdown();
}

let __dropdownEl = null;

function renderAccountDropdown() {
    if (!__dropdownEl) return;
    const active = getSession();
    const accounts = getAccounts().sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""));
    __dropdownEl.innerHTML = `
        <div class="acc-dropdown-head">حساب‌های من</div>
        ${accounts.map(a => {
            const isActive = active && active.token === a.token;
            const initial = (a.user.full_name || "؟").charAt(0);
            return `
            <div class="acc-row ${isActive ? "active" : ""}" data-key="${escapeHtml(a.key)}">
                <div class="avatar">${escapeHtml(initial)}</div>
                <div class="acc-row-info">
                    <div class="acc-row-name">${escapeHtml(a.user.full_name || "کاربر")}</div>
                    <div class="acc-row-role">${escapeHtml(switcherPrimaryRoleLabel(a.roles))} · مدرسه #${escapeHtml(a.user.school_id)}</div>
                </div>
                ${isActive ? '<span class="acc-row-check">✓</span>' : `<button type="button" class="acc-row-remove" data-remove-key="${escapeHtml(a.key)}" title="خروج از این حساب">✕</button>`}
            </div>`;
        }).join("")}
        <div class="acc-dropdown-sep"></div>
        <div class="acc-dropdown-action" id="accAddBtn">➕ افزودن حساب</div>
        <div class="acc-dropdown-sep"></div>
        <div class="acc-dropdown-action danger" id="accLogoutBtn">خروج از این حساب</div>
    `;

    __dropdownEl.querySelectorAll(".acc-row").forEach(row => {
        row.addEventListener("click", (e) => {
            if (e.target.closest(".acc-row-remove")) return;
            const key = row.dataset.key;
            const current = getSession();
            const acc = accounts.find(a => a.key === key);
            if (acc && (!current || current.token !== acc.token)) switchToAccount(key);
        });
    });
    __dropdownEl.querySelectorAll(".acc-row-remove").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeSwitcherAccount(btn.dataset.removeKey);
        });
    });
    __dropdownEl.querySelector("#accAddBtn").addEventListener("click", () => {
        toggleAccountDropdown(false);
        ensureAddAccountModal();
        document.getElementById("switcherModalOverlay").classList.add("show");
        document.getElementById("swSchoolId").focus();
    });
    __dropdownEl.querySelector("#accLogoutBtn").addEventListener("click", () => {
        toggleAccountDropdown(false);
        logout();
    });
}

function toggleAccountDropdown(force) {
    if (!__dropdownEl) return;
    const show = force !== undefined ? force : !__dropdownEl.classList.contains("show");
    if (show) renderAccountDropdown();
    __dropdownEl.classList.toggle("show", show);
}

/** Called once by initShell() right after it paints the topbar profile block. */
function initAccountSwitcher(session) {
    const profileEl = document.querySelector(".profile");
    if (!profileEl) return; // page has no topbar profile block -- nothing to attach the switcher to

    injectSwitcherStyles();

    // Make sure the account that's active right now is always in the saved
    // list too -- covers the very first login before this feature existed
    // in this browser, and keeps name/roles/token fresh on every page load.
    if (session) upsertAccount(session);

    profileEl.style.position = "relative";
    profileEl.setAttribute("data-acc-trigger", "1");
    if (!profileEl.querySelector(".profile-caret")) {
        const caret = document.createElement("span");
        caret.className = "profile-caret";
        caret.textContent = "▾";
        profileEl.appendChild(caret);
    }

    if (!__dropdownEl || !profileEl.contains(__dropdownEl)) {
        __dropdownEl = document.createElement("div");
        __dropdownEl.className = "acc-dropdown";
        profileEl.appendChild(__dropdownEl);
    }

    profileEl.addEventListener("click", (e) => {
        if (e.target.closest(".acc-dropdown")) return; // clicks inside the panel shouldn't re-toggle it
        toggleAccountDropdown();
    });
    document.addEventListener("click", (e) => {
        if (__dropdownEl && !profileEl.contains(e.target)) toggleAccountDropdown(false);
    });
}
