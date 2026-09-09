/* =========================================================
   jalali.js — Persian (Jalali/Shamsi) calendar support, shared
   across all 4 dashboards. Pure JS, no dependencies.

   Conversion algorithm: standard Jalaali <-> Gregorian (based on
   the well-known public-domain algorithm by Kazimierz Borkowski,
   as used in the jalaali-js library).

   Everything the BACKEND stores stays Gregorian ISO (unchanged --
   no schema/API impact). This file only affects what the user
   SEES and TYPES: display formatting + input pickers convert
   to/from Gregorian at the boundary.
========================================================= */

const PERSIAN_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const PERSIAN_WEEKDAYS_SHORT = ["ی", "د", "س", "چ", "پ", "ج", "ش"]; // Sun..Sat

function toPersianDigits(input) {
    const map = { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "۴", "5": "۵", "6": "۶", "7": "۷", "8": "۸", "9": "۹" };
    return String(input).replace(/[0-9]/g, (d) => map[d]);
}
function toEnglishDigits(input) {
    const map = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
    return String(input).replace(/[۰-۹]/g, (d) => map[d]);
}

function div(a, b) { return ~~(a / b); }
function mod(a, b) { return a - ~~(a / b) * b; }
function jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    const gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
    if (jy < jp || jy >= breaks[breaks.length - 1]) throw new Error("Jalali year out of range");
    for (i = 1; i < breaks.length; i += 1) {
        jm = breaks[i];
        jump = jm - jp;
        if (jy < jm) break;
        leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4);
        jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4);
    if ((jump % 33) === 4 && (jump - n) === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if ((jump - n) < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = (((n + 1) % 33) - 1) % 4;
    if (leap === -1) leap = 4;
    return { leap, gy, march };
}
function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
        + div(153 * ((gm + 9) % 12) + 2, 5)
        + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
}
function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div((j % 1461), 4) * 5 + 308;
    const gd = div(i % 153, 5) + 1;
    const gm = (div(i, 153) % 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return [gy, gm, gd];
}
function gregorianToJalali(gy, gm, gd) {
    return d2j(g2d(gy, gm, gd));
}
function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
    const gy = d2g(jdn)[0];
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    let jm, jd;
    if (k >= 0) {
        if (k <= 185) {
            jm = 1 + div(k, 31);
            jd = mod(k, 31) + 1;
            return [jy, jm, jd];
        }
        k -= 186;
    } else {
        jy -= 1;
        k += 179;
        if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return [jy, jm, jd];
}
function jalaliToGregorian(jy, jm, jd) {
    return d2g(j2d(jy, jm, jd));
}

function jalaliDaysInMonth(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return jalCal(jy).leap === 0 ? 30 : 29; // jalCal's "leap" is years-since-leap; 0 means jy itself is leap
}

/* ---------------------------------------------------------
   FORMATTING (Gregorian ISO string/Date -> Persian display)
--------------------------------------------------------- */
function formatJalaliDate(isoOrDate) {
    if (!isoOrDate) return "—";
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d)) return "—";
    const [jy, jm, jd] = d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    return toPersianDigits(`${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`);
}
function formatJalaliDateLong(isoOrDate) {
    if (!isoOrDate) return "—";
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d)) return "—";
    const [jy, jm, jd] = d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    return `${toPersianDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}
function formatJalaliDateTime(isoOrDate) {
    if (!isoOrDate) return "—";
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d)) return "—";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${formatJalaliDate(d)} - ${toPersianDigits(hh)}:${toPersianDigits(mm)}`;
}

/* ---------------------------------------------------------
   PICKERS
   Renders 3 <select> dropdowns (روز/ماه/سال) for date-only
   fields, or those 3 plus a native <input type="time"> for
   date+time fields. Works entirely offline, no calendar-grid
   UI needed, and is reliably tappable on mobile.

   Usage:
     renderJalaliDatePicker("holidayDate")              -> date only
     renderJalaliDatePicker("dueAt", { withTime: true }) -> date + time

     readJalaliDatePicker("holidayDate")              -> "2026-09-19"        (Gregorian date string)
     readJalaliDatePicker("dueAt", { withTime: true }) -> "2026-09-19T14:30" (Gregorian datetime-local string)

     setJalaliDatePicker("holidayDate", isoDateString) -> pre-fills the selects from a Gregorian value
--------------------------------------------------------- */
function renderJalaliDatePicker(prefix, opts = {}) {
    const now = new Date();
    const [jyNow] = d2j(g2d(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    const yearsBack = opts.yearsBack ?? 1;
    const yearsFwd = opts.yearsForward ?? 3;
    const years = [];
    for (let y = jyNow - yearsBack; y <= jyNow + yearsFwd; y++) years.push(y);

    const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)
        .map(d => `<option value="${d}">${toPersianDigits(d)}</option>`).join("");
    const monthOptions = PERSIAN_MONTHS
        .map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
    const yearOptions = years
        .map(y => `<option value="${y}">${toPersianDigits(y)}</option>`).join("");

    const timeInput = opts.withTime
        ? `<input type="time" class="form-input jalali-time" id="${prefix}_time" style="max-width:110px" value="${opts.defaultTime || "08:00"}">`
        : "";

    return `
        <div class="jalali-picker" style="display:flex;gap:6px;flex-wrap:wrap">
            <select class="form-input" id="${prefix}_d" style="max-width:80px">${dayOptions}</select>
            <select class="form-input" id="${prefix}_m" style="max-width:120px">${monthOptions}</select>
            <select class="form-input" id="${prefix}_y" style="max-width:100px">${yearOptions}</select>
            ${timeInput}
        </div>
    `;
}

function setJalaliDatePicker(prefix, isoDateOrDatetime, opts = {}) {
    if (!isoDateOrDatetime) return;
    const d = new Date(isoDateOrDatetime);
    if (isNaN(d)) return;
    const [jy, jm, jd] = d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    const dayEl = document.getElementById(`${prefix}_d`);
    const monEl = document.getElementById(`${prefix}_m`);
    const yearEl = document.getElementById(`${prefix}_y`);
    if (dayEl) dayEl.value = jd;
    if (monEl) monEl.value = jm;
    if (yearEl) yearEl.value = jy;
    if (opts.withTime) {
        const timeEl = document.getElementById(`${prefix}_time`);
        if (timeEl) timeEl.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
}

function readJalaliDatePicker(prefix, opts = {}) {
    const jd = Number(document.getElementById(`${prefix}_d`)?.value);
    const jm = Number(document.getElementById(`${prefix}_m`)?.value);
    const jy = Number(document.getElementById(`${prefix}_y`)?.value);
    if (!jd || !jm || !jy) return null;
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${gy}-${pad(gm)}-${pad(gd)}`;
    if (opts.withTime) {
        const time = document.getElementById(`${prefix}_time`)?.value || "00:00";
        return `${dateStr}T${time}`;
    }
    return dateStr;
}
