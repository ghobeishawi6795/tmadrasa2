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
}
