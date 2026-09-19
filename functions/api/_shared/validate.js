import { errors } from "./response.js";

export function requireFields(body, fields) {
    for (const f of fields) {
        if (body[f] === undefined || body[f] === null || body[f] === "") {
            throw errors.validation(`فیلد «${f}» الزامی است`);
        }
    }
}

export function requirePositiveInt(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw errors.validation(`${label} باید عدد صحیح مثبت باشد`);
    return n;
}

// Server-side text-length cap. Client-side limits alone are never enough --
// a direct API call can bypass any HTML maxlength. Applied to free-text
// fields that end up in D1 (no blob storage) so one bad request can't bloat
// a row or a query result unexpectedly.
export function requireMaxLength(value, max, label) {
    if (typeof value === "string" && value.length > max) {
        throw errors.validation(`${label} نباید بیشتر از ${max} نویسه باشد`);
    }
}

export async function readJson(request) {
    try {
        return await request.json();
    } catch {
        throw errors.validation("بدنه درخواست JSON معتبر نیست");
    }
}

// Wraps a Pages Function handler so any thrown Response (from errors.*) is returned
// instead of causing an unhandled exception / 500.
export function withErrorHandling(handler) {
    return async (context) => {
        try {
            return await handler(context);
        } catch (e) {
            if (e instanceof Response) return e;
            // DB trigger (migration 042) refuses overlapping active meetings. Without this the
            // user only ever saw a generic "internal server error" for a normal, expected conflict.
            if (/meeting time conflicts with another active meeting/.test(String((e && e.message) || ""))) {
                return errors.conflict("این بازه‌ی زمانی با جلسه‌ی فعال دیگری (برای همین معلم، والد یا دانش‌آموز) تداخل دارد؛ زمان دیگری انتخاب کنید");
            }
            console.error(e);
            return errors.server();
        }
        // debug patch removed — server errors no longer leak e.message to the client
    };
}
