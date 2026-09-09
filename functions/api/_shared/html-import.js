// Parses the fixed "AI-generated question/assignment" HTML template into
// structured items ready for insertion into `questions` or `assignments`.
// The template is intentionally simple (plain divs/lists with data-*
// attributes) specifically so an LLM can reproduce it exactly from a prompt
// -- see docs for the prompt text given to teachers. This is NOT a general
// HTML parser; it only understands this one fixed shape.

const BLOCK_RE = /<div\s+class="question"([^>]*)>([\s\S]*?)<\/div>/gi;
const ATTR_RE = /data-([\w-]+)\s*=\s*"([^"]*)"/g;

function parseAttrs(attrString) {
    const attrs = {};
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrString))) attrs[m[1]] = m[2];
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

function extractText(html, className) {
    const re = new RegExp(`<p\\s+class="${className}"[^>]*>([\\s\\S]*?)<\\/p>`, "i");
    const m = html.match(re);
    return m ? stripTags(m[1]) : null;
}

function extractListItems(html, ulClassName) {
    const ulRe = new RegExp(`<ul\\s+class="${ulClassName}"[^>]*>([\\s\\S]*?)<\\/ul>`, "i");
    const ulMatch = html.match(ulRe);
    if (!ulMatch) return [];
    const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    const items = [];
    let m;
    while ((m = liRe.exec(ulMatch[1]))) items.push({ attrs: parseAttrs(m[1]), text: stripTags(m[2]) });
    return items;
}

/** Returns an array of parsed items, each either a usable item or `{ error }`. */
export function parseImportHtml(html) {
    const blocks = [];
    let m;
    BLOCK_RE.lastIndex = 0;
    while ((m = BLOCK_RE.exec(html))) blocks.push({ attrs: parseAttrs(m[1]), inner: m[2] });
    return blocks.map((b, i) => parseOneItem(b, i));
}

function parseOneItem({ attrs, inner }, index) {
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
    return result;
}
