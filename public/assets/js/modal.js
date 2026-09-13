/* =========================================================
   modal.js — generic modal open/close, shared across all role pages
   Expects the host page to contain:
     <div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
       <div class="modal">
         <div class="modal-head"><div class="modal-title" id="modalTitle"></div>
           <button class="close" onclick="closeModal()">✕</button></div>
         <div id="modalContent"></div>
       </div>
     </div>
========================================================= */

function openModal(title, html) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalContent").innerHTML = html;
    document.getElementById("modalOverlay").classList.add("show");
}

function closeModal(event) {
    // if called from the overlay's onclick, only close when the overlay itself
    // (not something inside the modal box) was clicked
    if (event && event.target && event.target.id !== "modalOverlay" && event.type === "click") return;
    document.getElementById("modalOverlay").classList.remove("show");
    document.getElementById("modalContent").innerHTML = "";
    // if a promptModal() is awaiting and the modal closed some other way
    // (background click, Esc, etc.) rather than through its own buttons,
    // resolve it as a cancel so the caller's `await` doesn't hang forever.
    if (__modalPromptResolve) { const r = __modalPromptResolve; __modalPromptResolve = null; r(null); }
}

/* =========================================================
   promptModal — a styled stand-in for the browser's native prompt().
   Native prompt()/confirm() render as an ugly OS dialog that shows the
   page's raw URL, which looks broken/untrustworthy on a school app.
   Returns a Promise<string|null> (null = cancelled), same contract as
   window.prompt, so callers just add `await`.
========================================================= */
let __modalPromptResolve = null;

function promptModal(title, label, defaultValue) {
    return new Promise((resolve) => {
        __modalPromptResolve = resolve;
        openModal(title, `
            <form id="modalPromptForm">
                <div class="page-subtitle" style="margin-bottom:8px">${label}</div>
                <input class="form-input" id="modalPromptInput" value="${defaultValue ? escapeHtml(defaultValue) : ""}">
                <div class="modal-footer">
                    <button type="submit" class="primary-btn">تأیید</button>
                    <button type="button" class="secondary-btn" onclick="resolveModalPrompt(null)">لغو</button>
                </div>
            </form>
        `);
        const input = document.getElementById("modalPromptInput");
        document.getElementById("modalPromptForm").addEventListener("submit", (e) => {
            e.preventDefault();
            resolveModalPrompt(input.value);
        });
        input.focus();
    });
}

function resolveModalPrompt(value) {
    // clear the pending resolver BEFORE closing the modal, so closeModal()'s
    // own "resolve as cancel" safety-net (see above) doesn't fire and steal
    // this call's real value.
    const resolve = __modalPromptResolve;
    __modalPromptResolve = null;
    closeModal();
    if (resolve) resolve(value);
}
