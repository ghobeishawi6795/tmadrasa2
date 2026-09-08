/* =========================================================
   navigation.js — renders the sidebar <nav id="nav"> for any role page.
   Host page defines: window.navigate(pageKey) to handle page switches.
========================================================= */

let __navItems = [];
let __activePage = null;

/**
 * @param {Array<{key:string, icon:string, label:string, available?:boolean, note?:string}>} items
 *   `available: false` renders the item disabled with its `note` (e.g. "به‌زودی") as a tooltip --
 *   used for sections the backend doesn't support yet, so they're visible (not hidden) but honest.
 * @param {string} activeKey
 */
function renderNav(items, activeKey) {
    __navItems = items;
    __activePage = activeKey;

    const nav = document.getElementById("nav");
    nav.innerHTML = items.map(item => {
        const isActive = item.key === activeKey;
        const disabled = item.available === false;
        return `
            <button
                class="${isActive ? "active" : ""}"
                ${disabled ? `disabled title="${item.note || "به‌زودی"}" style="opacity:.45;cursor:default"` : `onclick="navigate('${item.key}')"`}
            >
                <span class="nav-icon">${item.icon}</span>
                <span>${item.label}</span>
            </button>
        `;
    }).join("");
}

function setActiveNav(key) {
    __activePage = key;
    renderNav(__navItems, key);
}
