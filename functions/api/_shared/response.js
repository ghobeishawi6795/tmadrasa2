export function ok(data = null, message = "OK") {
    return Response.json({ success: true, message, data }, { status: 200 });
}

export function created(data = null, message = "Created") {
    return Response.json({ success: true, message, data }, { status: 201 });
}

export function error(message = "خطایی رخ داد", status = 400, code = "BAD_REQUEST") {
    return Response.json({ success: false, error: { code, message } }, { status });
}

export const errors = {
    unauthorized: (m = "لطفاً وارد شوید") => error(m, 401, "UNAUTHORIZED"),
    forbidden: (m = "شما دسترسی لازم را ندارید") => error(m, 403, "FORBIDDEN"),
    notFound: (m = "مورد مورد نظر پیدا نشد") => error(m, 404, "NOT_FOUND"),
    validation: (m = "اطلاعات ارسالی نامعتبر است") => error(m, 400, "VALIDATION_ERROR"),
    conflict: (m = "این مورد قبلاً ثبت شده است") => error(m, 409, "CONFLICT"),
    server: (m = "خطای داخلی سرور") => error(m, 500, "SERVER_ERROR"),
};
