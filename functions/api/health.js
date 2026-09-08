// GET /api/health -- unauthenticated liveness/readiness check for external
// uptime monitors (e.g. UptimeRobot, Better Uptime -- free tiers exist).
// Cloudflare itself does not alert you when your app goes down; an
// external monitor hitting this endpoint every few minutes is the
// practical way to get that alert without adding paid infra.
// Intentionally returns nothing sensitive (no counts, no user data).
import { q } from "../_shared/db.js";

export async function onRequestGet({ env }) {
    const startedAt = Date.now();
    try {
        const db = q(env);
        await db.first(`SELECT 1 as ok`);
        return Response.json({
            status: "ok",
            db: "connected",
            latency_ms: Date.now() - startedAt,
            time: new Date().toISOString(),
        });
    } catch (e) {
        return Response.json({
            status: "error",
            db: "unreachable",
            time: new Date().toISOString(),
        }, { status: 503 });
    }
}
