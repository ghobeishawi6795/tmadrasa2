import { q } from "./_shared/db.js";

export async function onRequestGet({ env }) {
    try {
        const db = q(env);
        const result = await db.first("SELECT 1 AS ok");

        return new Response(
            JSON.stringify({
                ok: true,
                db: result?.ok === 1
            }),
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                ok: false,
                error: "Database unavailable"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }
}
