// Thin helper around Cloudflare D1 (env.DB)
export function q(env) {
    return {
        async all(sql, ...params) {
            return env.DB.prepare(sql).bind(...params).all();
        },
        async first(sql, ...params) {
            return env.DB.prepare(sql).bind(...params).first();
        },
        async run(sql, ...params) {
            return env.DB.prepare(sql).bind(...params).run();
        },
        async batch(statements) {
            // statements: array of { sql, params }
            const prepared = statements.map(s => env.DB.prepare(s.sql).bind(...(s.params || [])));
            return env.DB.batch(prepared);
        },
        raw: env.DB,
    };
}
