/* =========================================================
   account-panel.js — shared self-service "my account" panel.
   Renders password change + 2FA setup + active-session management
   into any container, for any authenticated role. Only calls
   role-agnostic endpoints (/api/auth/password, /api/auth/two-factor,
   /api/auth/sessions), so the same code works on every dashboard.

   Usage: <div id="accountPanel"></div> then mountAccountPanel('accountPanel');
========================================================= */

async function mountAccountPanel(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<p class="mini">در حال بارگذاری…</p>`;

    let status;
    try {
        status = await api.get("/api/auth/two-factor");
    } catch (e) {
        el.innerHTML = `<p class="mini">خطا در بارگذاری تنظیمات حساب</p>`;
        return;
    }

    render(el, status);
}

function render(el, status) {
    el.innerHTML = `
        <div class="account-block">
            <h4>🔑 تغییر رمز عبور</h4>
            <form id="apPasswordForm">
                <input class="form-input" type="password" name="current_password" placeholder="رمز فعلی" required style="margin-top:8px">
                <input class="form-input" type="password" name="new_password" minlength="8" placeholder="رمز جدید (حداقل ۸ نویسه)" required style="margin-top:8px">
                <button class="secondary-btn" style="margin-top:8px">تغییر رمز</button>
            </form>
        </div>
        <div class="account-block" style="margin-top:16px">
            <h4>🔐 ورود دومرحله‌ای (2FA)</h4>
            <p class="mini">وضعیت: <b>${status.enabled ? "فعال" : "غیرفعال"}</b></p>
            ${status.enabled
                ? `<form id="apDisable2fa"><input class="form-input" name="code" placeholder="کد ۶ رقمی یا کد پشتیبان" required style="margin-top:8px"><button class="secondary-btn" style="margin-top:8px">غیرفعال کردن 2FA</button></form>`
                : `<button class="secondary-btn" id="apStart2fa">راه‌اندازی 2FA</button>`
            }
            <div id="apSetupBox" style="margin-top:10px"></div>
        </div>
        <div class="account-block" style="margin-top:16px">
            <h4>💻 نشست‌های فعال</h4>
            <div id="apSessions"><p class="mini">در حال بارگذاری…</p></div>
        </div>
    `;

    el.querySelector("#apPasswordForm").onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            await api.post("/api/auth/password", { current_password: f.get("current_password"), new_password: f.get("new_password") });
            toast("رمز عبور تغییر کرد؛ نشست‌های دیگر شما باطل شدند");
            e.target.reset();
        } catch (err) { toast(err.message, true); }
    };

    const startBtn = el.querySelector("#apStart2fa");
    if (startBtn) startBtn.onclick = () => startTwoFactorSetup(el);

    const disableForm = el.querySelector("#apDisable2fa");
    if (disableForm) disableForm.onsubmit = async (e) => {
        e.preventDefault();
        const code = new FormData(e.target).get("code");
        try {
            await api.post("/api/auth/two-factor", { action: "disable", code });
            toast("۲مرحله‌ای غیرفعال شد");
            mountAccountPanel(el.id);
        } catch (err) { toast(err.message, true); }
    };

    loadSessions(el);
}

async function startTwoFactorSetup(el) {
    const box = el.querySelector("#apSetupBox");
    try {
        const setup = await api.post("/api/auth/two-factor", { action: "setup" });
        box.innerHTML = `
            <div class="field">
                <p class="mini">این کلید را در اپلیکیشن احراز هویت (Google Authenticator و مشابه) وارد کنید:</p>
                <p style="font-family:monospace;font-size:13px;word-break:break-all">${escapeHtml(setup.secret)}</p>
                <form id="apEnable2fa" style="margin-top:8px">
                    <input class="form-input" name="code" placeholder="کد ۶ رقمی نمایش‌داده‌شده در اپ" required>
                    <button class="primary-btn" style="margin-top:8px">تأیید و فعال‌سازی</button>
                </form>
            </div>
        `;
        box.querySelector("#apEnable2fa").onsubmit = async (e) => {
            e.preventDefault();
            const code = new FormData(e.target).get("code");
            try {
                const res = await api.post("/api/auth/two-factor", { action: "enable", code });
                box.innerHTML = `
                    <div class="field">
                        <p class="mini"><b>۲مرحله‌ای فعال شد.</b> کدهای پشتیبان زیر را همین حالا در جای امنی ذخیره کنید — دیگر نمایش داده نمی‌شوند:</p>
                        <p style="font-family:monospace;font-size:13px">${res.backup_codes.map(escapeHtml).join(" · ")}</p>
                        <button class="secondary-btn" style="margin-top:8px" onclick="mountAccountPanel('${el.id}')">بستن</button>
                    </div>
                `;
            } catch (err) { toast(err.message, true); }
        };
    } catch (err) { toast(err.message, true); }
}

async function loadSessions(el) {
    const box = el.querySelector("#apSessions");
    try {
        const sessions = await api.get("/api/auth/sessions");
        renderSessions(box, el.id, sessions, false);
    } catch (err) {
        box.innerHTML = `<p class="mini">بارگذاری نشست‌ها ناموفق بود</p>`;
    }
}

// Active/current sessions always show; old revoked ones pile up fast (one
// per login) and used to make this card the longest thing on the whole
// page, so by default we only show the 3 most recent revoked ones plus a
// "نمایش تاریخچه" toggle for the rest.
function renderSessions(box, containerId, sessions, showAll) {
    const live = sessions.filter(s => s.current || !s.revoked_at);
    const revoked = sessions.filter(s => !s.current && s.revoked_at);
    const shown = showAll ? revoked : revoked.slice(0, 3);
    const hiddenCount = revoked.length - shown.length;
    const row = s => `
        <div class="field" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
                <div>${s.current ? "🟢 این دستگاه" : "دستگاه دیگر"}${s.revoked_at ? " (باطل‌شده)" : ""}</div>
                <div class="mini">${escapeHtml(s.ip_address || "—")} — ${escapeHtml(s.created_at)}</div>
            </div>
            ${!s.current && !s.revoked_at ? `<button class="secondary-btn" onclick="revokeSession('${containerId}',${s.id})">خروج از این دستگاه</button>` : ""}
        </div>`;
    box.innerHTML = live.map(row).join("")
        + shown.map(row).join("")
        + (hiddenCount > 0 ? `<button class="secondary-btn" style="margin-top:6px" onclick="expandSessionHistory('${containerId}')">نمایش ${hiddenCount} نشست قدیمی‌تر</button>` : "")
        + `<button class="secondary-btn" onclick="revokeAllSessions('${containerId}')" style="margin-top:6px">خروج از همه‌ی دستگاه‌های دیگر</button>`;
    box.dataset.sessions = JSON.stringify(sessions);
}

async function expandSessionHistory(containerId) {
    const el = document.getElementById(containerId);
    const box = el.querySelector("#apSessions");
    const sessions = JSON.parse(box.dataset.sessions || "[]");
    renderSessions(box, containerId, sessions, true);
}

async function revokeSession(containerId, id) {
    try { await api.del("/api/auth/sessions", { id }); toast("نشست باطل شد"); mountAccountPanel(containerId); }
    catch (err) { toast(err.message, true); }
}

async function revokeAllSessions(containerId) {
    try { await api.del("/api/auth/sessions", { all: true }); toast("همه‌ی نشست‌ها باطل شدند"); mountAccountPanel(containerId); }
    catch (err) { toast(err.message, true); }
}
