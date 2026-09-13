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

/* =========================================================
   Second, stacked overlay ("previewModalOverlay") used for things like
   the teacher's "پیش‌نمایش به چشم دانش‌آموز" question preview — kept
   separate from the main modal so opening a preview on top of an
   open form doesn't wipe out (and lose) whatever the teacher already
   typed into that form underneath.
   Host pages that want this must include a previewModalOverlay/
   previewModalTitle/previewModalContent block (see teacher/index.html).
   If a caller needs to clean something up when the preview closes
   (e.g. remove a postMessage listener), set window.__onPreviewModalClose
   to a function before opening it.
========================================================= */

function openPreviewModal(title, html) {
    document.getElementById("previewModalTitle").textContent = title;
    document.getElementById("previewModalContent").innerHTML = html;
    document.getElementById("previewModalOverlay").classList.add("show");
}

function closePreviewModal(event) {
    if (event && event.target && event.target.id !== "previewModalOverlay" && event.type === "click") return;
    document.getElementById("previewModalOverlay").classList.remove("show");
    document.getElementById("previewModalContent").innerHTML = "";
    if (window.__onPreviewModalClose) { const fn = window.__onPreviewModalClose; window.__onPreviewModalClose = null; fn(); }
}
