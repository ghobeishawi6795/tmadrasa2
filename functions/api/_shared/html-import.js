// Parses the "AI-generated question/assignment" HTML template into
// structured items ready for insertion into `questions` or `assignments`.
// The template's REQUIRED elements (data-* attributes, q-text/q-answer/
// q-options/q-pairs/q-buckets/q-items) are still a fixed shape -- this is
// NOT a general HTML parser -- but as of the multi-question/colorful-preview
// feature, the file is allowed to contain decorative wrapper <div>s, extra
// classes, inline styles, and a shared <style> block around/alongside those
// required elements, so an AI-generated file can look like a real page
// instead of dry unstyled text. See docs/راهنمای-وارد-کردن-html.md.

const CLASS_ATTR_RE = /class\s*=\s*"([^"]*)"/i;
const DIV_TAG_RE = /<(\/?)div\b[^>]*>/gi;
const STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

function hasClass(attrString, className) {
    const m = attrString.match(CLASS_ATTR_RE);
    if (!m) return false;
    return m[1].trim().split(/\s+/).includes(className);
}

function parseAttrs(attrString) {
    const attrs = {};
    const re = /data-([\w-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrString))) attrs[m[1]] = m[2];
    return attrs;
}

function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .trim();
}

// Strips anything that could execute or reach out over the network from
// HTML we're going to store and later render (in a sandboxed iframe with no
// script execution anyway -- this is defense in depth, not the only guard).
function sanitizeDecorativeHtml(html) {
    if (!html) return html;
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<link\b[^>]*>/gi, "")
        .replace(/@import[^;]+;/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/javascript\s*:/gi, "blocked:");
}

// match/drag_drop questions already render through our own secure widget
// (shuffled ids, answer key never sent to the client -- see
// _shared/interactive.js's sanitizeForStudent()). The raw imported HTML for
// these two types still contains the actual correct pairing/bucket in
// data-left/data-right/data-bucket attributes, so those specific lists must
// never be forwarded to the student as decorative HTML, or the answer key
// leaks straight through the page source.
function stripAnswerRevealingLists(html, submissionType) {
    if (submissionType !== "match" && submissionType !== "drag_drop") return html;
    return html
        .replace(/<ul\b[^>]*class="[^"]*\bq-pairs\b[^"]*"[^>]*>[\s\S]*?<\/ul>/gi, "")
        .replace(/<ul\b[^>]*class="[^"]*\bq-buckets\b[^"]*"[^>]*>[\s\S]*?<\/ul>/gi, "")
        .replace(/<ul\b[^>]*class="[^"]*\bq-items\b[^"]*"[^>]*>[\s\S]*?<\/ul>/gi, "");
}

// Finds every top-level <div> whose class list includes "question" and
// returns its full outer HTML + inner HTML, using a depth-tracking scan
// (not a single non-greedy regex) so a block containing nested <div>s --
// which colorful/decorated question HTML almost always does -- is captured
// in full instead of being silently truncated at the first nested </div>.
function findQuestionBlocks(html) {
    const blocks = [];
    const openRe = /<div\b([^>]*)>/gi;
    let m;
    while ((m = openRe.exec(html))) {
        if (!hasClass(m[1], "question")) continue;

        const innerStart = m.index + m[0].length;
        DIV_TAG_RE.lastIndex = innerStart;
        let depth = 1, closeTag = null, t;
        while ((t = DIV_TAG_RE.exec(html))) {
            if (t[1] === "/") { depth--; if (depth === 0) { closeTag = t; break; } }
            else depth++;
        }
        if (!closeTag) continue; // malformed/unclosed block -- skip it silently

        const inner = html.slice(innerStart, closeTag.index);
        const fullMatch = html.slice(m.index, closeTag.index + closeTag[0].length);
        blocks.push({ attrs: parseAttrs(m[1]), inner, fullMatch });

        openRe.lastIndex = closeTag.index + closeTag[0].length;
    }
    return blocks;
}

function extractText(html, className) {
    const re = /<(p|div|span|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html))) {
        if (hasClass(m[2], className)) return stripTags(m[3]);
    }
    return null;
}

function extractListItems(html, ulClassName) {
    const re = /<ul\b([^>]*)>([\s\S]*?)<\/ul>/gi;
    let m, ulInner = null;
    while ((m = re.exec(html))) {
        if (hasClass(m[1], ulClassName)) { ulInner = m[2]; break; }
    }
    if (ulInner === null) return [];
    const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    const items = [];
    let lm;
    while ((lm = liRe.exec(ulInner))) items.push({ attrs: parseAttrs(lm[1]), text: stripTags(lm[2]) });
    return items;
}

/**
 * Returns { items, styleBlock }. `items` is an array of parsed items, each
 * either a usable item or `{ error }`. `styleBlock` is every <style> tag's
 * content found anywhere in the file, concatenated -- shared across every
 * assignment question bundled from this one file (see import-html.js).
 */
export function parseImportHtml(html) {
    const blocks = findQuestionBlocks(html);
    const items = blocks.map((b, i) => parseOneItem(b, i));

    let styleBlock = "";
    let sm;
    STYLE_RE.lastIndex = 0;
    while ((sm = STYLE_RE.exec(html))) styleBlock += sm[1] + "\n";
    styleBlock = sanitizeDecorativeHtml(styleBlock).trim();

    return { items, styleBlock: styleBlock || null };
}

function parseOneItem({ attrs, inner, fullMatch }, index) {
    const type = (attrs.type || "").trim();
    const target = attrs.target === "assignment" ? "assignment" : "exam";
    const subjectName = (attrs.subject || "").trim();
    const base = { index, type, target, subjectName };

    if (!type) return { ...base, error: "نوع سؤال (data-type) مشخص نشده" };
    if (!subjectName) return { ...base, error: "نام درس (data-subject) مشخص نشده" };

    if (target === "exam") {
        const text = extractText(inner, "q-text");
        if (!text) return { ...base, error: "متن سؤال (q-text) پیدا نشد" };
        const result = { ...base, text };

        if (type === "multiple_choice") {
            const options = extractListItems(inner, "q-options").map(o => ({
                text: o.text, is_correct: o.attrs["correct"] === "true",
            }));
            if (options.length < 2) return { ...base, error: "حداقل ۲ گزینه (q-options) لازم است" };
            if (options.filter(o => o.is_correct).length !== 1) return { ...base, error: "دقیقاً یک گزینه باید data-correct=\"true\" باشد" };
            result.options = options;
        } else if (type === "true_false") {
            const ans = extractText(inner, "q-answer");
            if (ans !== "true" && ans !== "false") return { ...base, error: "پاسخ true/false (q-answer) پیدا نشد" };
            result.correct_boolean = ans === "true";
        } else if (type === "numeric") {
            const ans = extractText(inner, "q-answer");
            const n = Number(ans);
            if (!ans || Number.isNaN(n)) return { ...base, error: "پاسخ عددی معتبر (q-answer) پیدا نشد" };
            result.correct_numeric = n;
        } else if (type === "short_answer" || type === "long_answer") {
            result.correct_text = extractText(inner, "q-answer");
        } else {
            return { ...base, error: `نوع «${type}» برای بانک آزمون معتبر نیست` };
        }
        // Kept for the bank's teacher-only "exact original preview" (eye
        // icon) -- safe to keep the raw block as-is (incl. the correct
        // answer in data-correct/q-answer) since this never reaches a
        // student, unlike the assignment-target match/drag_drop case above.
        result.blockHtml = sanitizeDecorativeHtml(fullMatch);
        return result;
    }

    // target === "assignment"
    const title = (attrs.title || "").trim();
    if (!title) return { ...base, error: "عنوان تکلیف (data-title) مشخص نشده" };
    const dueDays = Number(attrs["due-days"]) || 7;
    const description = extractText(inner, "q-instructions") || "";
    const result = { ...base, title, dueDays, description };

    if (type === "match") {
        const pairs = extractListItems(inner, "q-pairs")
            .map(li => ({ left: li.attrs["left"] || "", right: li.attrs["right"] || "" }))
            .filter(p => p.left && p.right);
        if (pairs.length < 2) return { ...base, error: "حداقل ۲ جفت (q-pairs) لازم است" };
        result.submission_type = "match";
        result.question_payload = { pairs };
    } else if (type === "drag_drop") {
        const buckets = extractListItems(inner, "q-buckets").map(li => li.text).filter(Boolean);
        const items = extractListItems(inner, "q-items").map(li => ({
            text: li.text, bucket_index: Number(li.attrs["bucket"]),
        }));
        if (buckets.length < 2) return { ...base, error: "حداقل ۲ دسته (q-buckets) لازم است" };
        if (items.length < 2 || items.some(it => !it.text || Number.isNaN(it.bucket_index))) {
            return { ...base, error: "آیتم‌های q-items ناقص یا data-bucket نامعتبر است" };
        }
        result.submission_type = "drag_drop";
        result.question_payload = { buckets, items };
    } else if (["text", "photo", "audio", "draw"].includes(type)) {
        result.submission_type = type;
    } else {
        return { ...base, error: `نوع «${type}» برای تکلیف معتبر نیست` };
    }

    const cleanedBlock = stripAnswerRevealingLists(fullMatch, result.submission_type);
    result.blockHtml = sanitizeDecorativeHtml(cleanedBlock);
    return result;
}
