// تولید خودکار «نسخهٔ مشابه» برای سؤالات محاسباتی (فقط عددها عوض می‌شن، ساختار سؤال ثابت می‌مونه).
// منطق هسته عیناً از دبستان پورت شده؛ فقط ورودی/خروجی با ستون‌های مدرسه
// (text/correct_numeric/correct_boolean/question_options بجای content_json)
// تطبیق داده شده. عمداً محدود به سؤالاتی که یک عبارت محاسباتی صریح دارن
// (مثل «۵ + ۳») -- روی مسئله‌های کلامی کاری انجام نمی‌ده، چون نمی‌شه با
// اطمینان فهمید کدوم عدد به کدوم عملوند اشاره داره؛ تولید نادرست یعنی
// کلید پاسخ اشتباه، که این پروژه همیشه ازش پرهیز کرده.

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const MULT_CHARS = ["×", "x", "X", "*"];
const DIV_CHARS = ["÷", "/"];

function toLatinDigits(s) { return String(s).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))); }
function toFaDigits(n) { return String(n).replace(/\d/g, (d) => FA_DIGITS[d]); }
function usesFaDigits(s) { return /[۰-۹]/.test(s); }
function formatNum(n, faStyle) { return faStyle ? toFaDigits(n) : String(n); }

function opFn(opChar) {
    if (opChar === "+") return (a, b) => a + b;
    if (opChar === "-") return (a, b) => a - b;
    if (MULT_CHARS.includes(opChar)) return (a, b) => a * b;
    if (DIV_CHARS.includes(opChar)) return (a, b) => (b !== 0 ? a / b : null);
    return null;
}

// محدودهٔ اعداد جدید رو با همون تعداد رقم عدد اصلی نگه می‌داره (سطح سختی عوض نشه)
function digitRange(n) {
    const len = String(Math.abs(n)).length;
    const min = len === 1 ? 0 : Math.pow(10, len - 1);
    const max = Math.pow(10, len) - 1;
    return [min, max];
}
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

function generatePair(a, b, opChar) {
    const [aMin, aMax] = digitRange(a);
    const [bMin, bMax] = digitRange(b);

    if (DIV_CHARS.includes(opChar)) {
        if (b === 0 || a % b !== 0) return null;
        const originalQuotient = a / b;
        for (let i = 0; i < 300; i++) {
            const newB = randInt(Math.max(bMin, 1), Math.max(bMax, 1));
            const newQuotient = Math.max(1, originalQuotient + randInt(-2, 2));
            const newA = newB * newQuotient;
            if (newA < aMin || newA > aMax) continue;
            if (newA === a && newB === b) continue;
            return [newA, newB];
        }
        return null;
    }

    const wantNonNegative = opChar === "-" ? (a - b >= 0) : null;
    for (let i = 0; i < 300; i++) {
        const newA = randInt(aMin, aMax);
        const newB = randInt(bMin, bMax);
        if (opChar === "-" && (newA - newB >= 0) !== wantNonNegative) continue;
        if (newA === a && newB === b) continue;
        return [newA, newB];
    }
    return null;
}

function findArithNoEquals(text) {
    const re = /([۰-۹\d]+)(\s*[+\-×xX*÷/]\s*)([۰-۹\d]+)/d;
    const m = String(text).match(re);
    if (!m || !m.indices) return null;
    const opChar = m[2].trim();
    if (!opFn(opChar)) return null;
    return { m, opChar, aStr: m[1], bStr: m[3], indices: m.indices };
}
function findArithWithEquals(text) {
    const re = /([۰-۹\d]+)(\s*[+\-×xX*÷/]\s*)([۰-۹\d]+)(\s*=\s*)([۰-۹\d]+)/d;
    const m = String(text).match(re);
    if (!m || !m.indices) return null;
    const opChar = m[2].trim();
    if (!opFn(opChar)) return null;
    return { m, opChar, aStr: m[1], bStr: m[3], eqStr: m[5], indices: m.indices };
}

function spliceNumbers(text, indices, replacements) {
    const parts = [];
    let cursor = 0;
    for (const r of replacements.sort((x, y) => x.groupIndex - y.groupIndex)) {
        const [start, end] = indices[r.groupIndex];
        parts.push(text.slice(cursor, start));
        parts.push(r.value);
        cursor = end;
    }
    parts.push(text.slice(cursor));
    return parts.join("");
}

const UNSUPPORTED = { ok: false, reason: "این سؤال یک عبارت محاسباتی صریح (مثل «۵ + ۳») نداره؛ فعلاً فقط برای این‌جور سؤالات نسخهٔ خودکار ساخته می‌شه." };

// question: ردیف زنده‌ی جدول questions. options: آرایه‌ی question_options
// (فقط برای multiple_choice). خروجی patch مستقیم قابل‌پاس‌دادن به بدنه‌ی
// createQuestionRecord هست (بعد از merge با متادیتای کپی‌شده از سؤال اصلی).

function generateNumericVariant(question) {
    const found = findArithNoEquals(question.text || "");
    if (!found) return UNSUPPORTED;
    const a = Number(toLatinDigits(found.aStr));
    const b = Number(toLatinDigits(found.bStr));
    const fn = opFn(found.opChar);
    const originalResult = fn(a, b);
    if (originalResult === null || !Number.isFinite(originalResult) || originalResult !== question.correct_numeric) return UNSUPPORTED;

    const pair = generatePair(a, b, found.opChar);
    if (!pair) return UNSUPPORTED;
    const [newA, newB] = pair;
    const newResult = fn(newA, newB);
    const faStyle = usesFaDigits(found.aStr);
    const newText = spliceNumbers(question.text, found.indices, [
        { groupIndex: 1, value: formatNum(newA, faStyle) },
        { groupIndex: 3, value: formatNum(newB, faStyle) },
    ]);
    return { ok: true, patch: { text: newText, correct_numeric: newResult, numeric_tolerance: question.numeric_tolerance } };
}

function generateMultipleChoiceVariant(question, options) {
    const found = findArithNoEquals(question.text || "");
    if (!found) return UNSUPPORTED;
    const a = Number(toLatinDigits(found.aStr));
    const b = Number(toLatinDigits(found.bStr));
    const fn = opFn(found.opChar);
    const originalResult = fn(a, b);
    const correctOpt = options.find(o => o.is_correct);
    if (originalResult === null || !Number.isFinite(originalResult) || !correctOpt) return UNSUPPORTED;
    if (Number(toLatinDigits(correctOpt.text)) !== originalResult) return UNSUPPORTED;

    const optionNums = options.map(o => Number(toLatinDigits(o.text)));
    if (optionNums.some(n => !Number.isFinite(n))) return UNSUPPORTED;

    const pair = generatePair(a, b, found.opChar);
    if (!pair) return UNSUPPORTED;
    const [newA, newB] = pair;
    const newResult = fn(newA, newB);
    const faStyle = usesFaDigits(found.aStr);
    const newText = spliceNumbers(question.text, found.indices, [
        { groupIndex: 1, value: formatNum(newA, faStyle) },
        { groupIndex: 3, value: formatNum(newB, faStyle) },
    ]);
    const optFaStyle = usesFaDigits(correctOpt.text);
    const deltas = optionNums.map(n => n - originalResult);
    const newOptionTexts = deltas.map(d => formatNum(newResult + d, optFaStyle));
    if (new Set(newOptionTexts).size !== newOptionTexts.length) return UNSUPPORTED;

    return {
        ok: true,
        patch: {
            text: newText,
            options: options.map((o, i) => ({ text: newOptionTexts[i], is_correct: !!o.is_correct })),
        },
    };
}

function generateTrueFalseVariant(question) {
    const found = findArithWithEquals(question.text || "");
    if (!found) return UNSUPPORTED;
    const a = Number(toLatinDigits(found.aStr));
    const b = Number(toLatinDigits(found.bStr));
    const statedResult = Number(toLatinDigits(found.eqStr));
    const fn = opFn(found.opChar);
    const computedResult = fn(a, b);
    if (computedResult === null || !Number.isFinite(computedResult) || !Number.isFinite(statedResult)) return UNSUPPORTED;
    const derivedTruth = statedResult === computedResult;
    if (derivedTruth !== !!question.correct_boolean) return UNSUPPORTED;

    const pair = generatePair(a, b, found.opChar);
    if (!pair) return UNSUPPORTED;
    const [newA, newB] = pair;
    const newComputed = fn(newA, newB);
    const originalOffset = statedResult - computedResult;
    const newStated = newComputed + originalOffset;
    const faStyle = usesFaDigits(found.aStr);
    const newText = spliceNumbers(question.text, found.indices, [
        { groupIndex: 1, value: formatNum(newA, faStyle) },
        { groupIndex: 3, value: formatNum(newB, faStyle) },
        { groupIndex: 5, value: formatNum(newStated, usesFaDigits(found.eqStr)) },
    ]);
    return { ok: true, patch: { text: newText, correct_boolean: question.correct_boolean } };
}

export const VARIANT_SUPPORTED_TYPES = ["numeric", "multiple_choice", "true_false"];

export function generateQuestionVariant(question, options) {
    if (question.type === "numeric") return generateNumericVariant(question);
    if (question.type === "multiple_choice") return generateMultipleChoiceVariant(question, options);
    if (question.type === "true_false") return generateTrueFalseVariant(question);
    return { ok: false, reason: "تولید خودکار نسخه فعلاً فقط برای سؤالات «چندگزینه‌ای»، «عددی» و «درست/غلط» با یک عبارت محاسباتی صریح پشتیبانی می‌شه." };
}
