// Shared logic for the two auto-graded interactive assignment types:
// "match" (pair left items with right items) and "drag_drop" (sort items
// into buckets/categories). Both follow the same security principle already
// used for exam multiple_choice questions elsewhere in this app: the
// correct answer must never be sent to the student's browser.
//
// For "match" specifically, a naive design would give each pair a single
// shared id and expose it on both sides -- but unlike an exam option's id
// (which is opaque and reveals nothing on its own), a *shared* id would let
// the correct pairing be read directly off the two id lists without ever
// calling the server. So each pair gets two independent, unrelated ids
// (left_id / right_id) generated once at creation time; the mapping between
// them lives only in the server-stored payload, never in the client-facing
// one.
import { errors } from "./response.js";

function randomToken() {
    // 8 random bytes, base36 -- plenty of entropy for "unguessable id shown
    // in a list of ~10", not a security-critical secret on its own.
    return Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(36)).join("").slice(0, 8);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Validates the teacher's input and builds the server-stored payload
 * (contains the answer key). Throws on bad input.
 */
export function buildQuestionPayload(submissionType, input) {
    if (submissionType === "match") {
        if (!Array.isArray(input?.pairs) || input.pairs.length < 2) {
            throw errors.validation("برای نوع «تطبیق» حداقل ۲ جفت لازم است");
        }
        if (input.pairs.length > 10) throw errors.validation("حداکثر ۱۰ جفت مجاز است");
        const pairs = input.pairs.map((p, i) => {
            if (!p.left?.trim() || !p.right?.trim()) throw errors.validation(`جفت شماره ${i + 1} ناقص است`);
            return { left_id: `l${i}`, left_text: p.left.trim(), right_id: randomToken(), right_text: p.right.trim() };
        });
        return { pairs };
    }

    if (submissionType === "drag_drop") {
        if (!Array.isArray(input?.buckets) || input.buckets.length < 2) {
            throw errors.validation("برای نوع «دسته‌بندی» حداقل ۲ دسته لازم است");
        }
        if (!Array.isArray(input?.items) || input.items.length < 2) {
            throw errors.validation("حداقل ۲ آیتم برای دسته‌بندی لازم است");
        }
        if (input.items.length > 15) throw errors.validation("حداکثر ۱۵ آیتم مجاز است");
        const buckets = input.buckets.map(b => String(b).trim()).filter(Boolean);
        if (buckets.length < 2) throw errors.validation("نام دسته‌ها نمی‌تواند خالی باشد");

        const items = input.items.map((it, i) => {
            if (!it.text?.trim()) throw errors.validation(`آیتم شماره ${i + 1} متن ندارد`);
            const bucketIndex = Number(it.bucket_index);
            if (!Number.isInteger(bucketIndex) || bucketIndex < 0 || bucketIndex >= buckets.length) {
                throw errors.validation(`دسته‌ی آیتم شماره ${i + 1} نامعتبر است`);
            }
            return { item_id: `i${i}`, text: it.text.trim(), bucket_index: bucketIndex };
        });
        return { buckets, items };
    }

    return null;
}

/**
 * Strips the answer key out of a stored payload for sending to a student.
 * `assignment` needs .submission_type and .question_payload (raw JSON string).
 */
export function sanitizeForStudent(assignment) {
    if (!assignment.question_payload) return null;
    const payload = JSON.parse(assignment.question_payload);

    if (assignment.submission_type === "match") {
        return {
            left_items: payload.pairs.map(p => ({ id: p.left_id, text: p.left_text })),
            right_items: shuffle(payload.pairs.map(p => ({ id: p.right_id, text: p.right_text }))),
        };
    }

    if (assignment.submission_type === "drag_drop") {
        return {
            buckets: payload.buckets,
            items: shuffle(payload.items.map(it => ({ id: it.item_id, text: it.text }))),
        };
    }

    return null;
}

/**
 * Grades a student's answer against the server-stored payload.
 * Returns { score, maxScore, correctCount, totalCount }. Never throws for a
 * "wrong" answer -- only for a structurally invalid one (see validation
 * inside each branch), so a partial/confused submission still gets scored
 * rather than rejected.
 */
export function gradeInteractiveAnswer(assignment, studentAnswer) {
    const payload = JSON.parse(assignment.question_payload);
    const maxScore = assignment.max_score;

    if (assignment.submission_type === "match") {
        if (!Array.isArray(studentAnswer?.matches)) throw errors.validation("فرمت پاسخ نامعتبر است");
        const correctByLeft = Object.fromEntries(payload.pairs.map(p => [p.left_id, p.right_id]));
        let correctCount = 0;
        for (const m of studentAnswer.matches) {
            if (correctByLeft[m.left_id] && correctByLeft[m.left_id] === m.right_id) correctCount++;
        }
        const total = payload.pairs.length;
        return { score: Math.round((correctCount / total) * maxScore * 100) / 100, maxScore, correctCount, totalCount: total };
    }

    if (assignment.submission_type === "drag_drop") {
        if (!Array.isArray(studentAnswer?.placements)) throw errors.validation("فرمت پاسخ نامعتبر است");
        const correctByItem = Object.fromEntries(payload.items.map(it => [it.item_id, it.bucket_index]));
        let correctCount = 0;
        for (const p of studentAnswer.placements) {
            if (correctByItem[p.item_id] !== undefined && correctByItem[p.item_id] === Number(p.bucket_index)) correctCount++;
        }
        const total = payload.items.length;
        return { score: Math.round((correctCount / total) * maxScore * 100) / 100, maxScore, correctCount, totalCount: total };
    }

    throw errors.validation("این نوع تکلیف خودکار تصحیح نمی‌شود");
}
