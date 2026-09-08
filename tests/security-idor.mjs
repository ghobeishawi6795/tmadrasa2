#!/usr/bin/env node
// tests/security-idor.mjs
//
// End-to-end security regression tests: cross-school access (IDOR), cross-role
// access, resource-ownership bypass attempts, and login rate limiting.
//
// HOW TO RUN:
//   1. Start the API locally:      wrangler pages dev public --d1=DB --local
//   2. Load the fixture data:      wrangler d1 execute madrese --local --file=tests/fixtures/security-fixtures.sql
//   3. Run this script:            BASE_URL=http://127.0.0.1:8788 node tests/security-idor.mjs
//   4. When done, remove the fixture data using the commented DELETE statements
//      at the bottom of security-fixtures.sql (uncomment + run with --file).
//
// This script only calls the public HTTP API -- it never touches the database
// directly -- so a pass here means the API itself enforces the rule, not just
// the underlying schema.
//
// Exit code is 0 if every check passed, 1 otherwise (so it can be used in CI).

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8788";
const PASSWORD = "Test@1234";

let passed = 0, failed = 0;
const failures = [];

function report(name, ok, detail) {
    if (ok) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    else { failed++; failures.push(name + (detail ? ` -- ${detail}` : "")); console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? " -- " + detail : ""}`); }
}

async function call(method, path, { token, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON, leave null */ }
    return { status: res.status, json };
}

async function login(schoolId, username, password = PASSWORD) {
    const { status, json } = await call("POST", "/api/auth/login", {
        body: { school_id: schoolId, username, password },
    });
    if (status !== 200 || !json?.data?.token) {
        throw new Error(`login failed for ${username}@${schoolId}: status=${status} body=${JSON.stringify(json)}`);
    }
    return json.data.token;
}

function expectStatus(name, result, expected) {
    const ok = Array.isArray(expected) ? expected.includes(result.status) : result.status === expected;
    report(name, ok, ok ? undefined : `expected ${expected}, got ${result.status} (${JSON.stringify(result.json)})`);
}

async function main() {
    console.log(`\nRunning security tests against ${BASE_URL}\n`);
    console.log("Logging in fixture users...");

    const adminA = await login(90001, "admin_a");
    const teacherA = await login(90001, "teacher_a");
    const teacherA2 = await login(90001, "teacher_a2");
    const studentA1 = await login(90001, "student_a1");
    const studentA3 = await login(90001, "student_a3"); // not enrolled in class 90031
    const parentA = await login(90001, "parent_a");     // owns only student_a1 (90013)

    const adminB = await login(90002, "admin_b");
    const teacherB = await login(90002, "teacher_b");

    console.log("\n--- Cross-school (IDOR) ---");

    // Admin B tries to delete a class belonging to School A
    expectStatus(
        "admin B cannot delete school A's class",
        await call("DELETE", "/api/admin/classes", { token: adminB, body: { id: 90031 } }),
        [403, 404]
    );

    // Admin B's student list must not leak School A's students
    {
        const { status, json } = await call("GET", "/api/admin/students", { token: adminB });
        const leaked = (json?.data || []).some(s => [90013, 90014, 90017].includes(s.id));
        report("admin B's student list excludes school A students", status === 200 && !leaked,
            leaked ? "school A student id appeared in school B's list" : undefined);
    }

    // Teacher B tries to publish/close/delete an exam owned by School A
    expectStatus(
        "teacher B cannot close school A's exam",
        await call("PUT", "/api/teacher/exams", { token: teacherB, body: { id: 90061, action: "close" } }),
        [403, 404]
    );
    expectStatus(
        "teacher B cannot delete school A's exam",
        await call("DELETE", "/api/teacher/exams", { token: teacherB, body: { id: 90061 } }),
        [403, 404]
    );

    // Teacher B tries to grade School A's pending manual answer
    expectStatus(
        "teacher B cannot grade school A's exam answer",
        await call("POST", "/api/teacher/grading", { token: teacherB, body: { answer_id: 90151, score: 5 } }),
        [403, 404]
    );

    // Student A1 tries to view School B's exam
    expectStatus(
        "student A1 cannot view school B's exam",
        await call("GET", "/api/student/exams?id=90062", { token: studentA1 }),
        [403, 404]
    );

    console.log("\n--- Same-school, cross-owner ---");

    // Teacher A tries to close/delete an exam owned by teacher_a2 (same school)
    expectStatus(
        "teacher A cannot close teacher_a2's exam (same school)",
        await call("PUT", "/api/teacher/exams", { token: teacherA, body: { id: 90063, action: "close" } }),
        403
    );
    expectStatus(
        "teacher A cannot delete teacher_a2's exam (same school)",
        await call("DELETE", "/api/teacher/exams", { token: teacherA, body: { id: 90063 } }),
        403
    );

    console.log("\n--- Class / role ownership ---");

    // Student A3 (not enrolled in class 90031) tries to start an attempt on its exam
    expectStatus(
        "unenrolled student cannot start an attempt on the class exam",
        await call("POST", "/api/student/exam-attempt", { token: studentA3, body: { action: "start", exam_id: 90061 } }),
        403
    );

    console.log("\n--- Parent ownership ---");

    // Parent A tries to view grades for student_a2 (not their child, same school)
    expectStatus(
        "parent A cannot view a non-child's grades (same school)",
        await call("GET", "/api/parent/grades?student_id=90014", { token: parentA }),
        403
    );

    // Parent A tries to view grades for student_b1 (different school entirely)
    expectStatus(
        "parent A cannot view a student's grades from another school",
        await call("GET", "/api/parent/grades?student_id=90023", { token: parentA }),
        [403, 404]
    );

    // Sanity check: parent A CAN view their actual child's grades
    expectStatus(
        "parent A CAN view their own child's grades",
        await call("GET", "/api/parent/grades?student_id=90013", { token: parentA }),
        200
    );

    console.log("\n--- Messaging membership ---");

    // Student A3 (not a member of conversation 90121) tries to read it
    expectStatus(
        "non-member cannot read a conversation's messages",
        await call("GET", "/api/messages/messages?conversation_id=90121", { token: studentA3 }),
        403
    );

    console.log("\n--- Login rate limiting ---");
    {
        // 5 wrong-password attempts against a throwaway fixture user, then a 6th
        // attempt with the CORRECT password should still be blocked.
        let lastStatus;
        for (let i = 0; i < 5; i++) {
            const r = await call("POST", "/api/auth/login", {
                body: { school_id: 90001, username: "student_a2", password: "wrong-password" },
            });
            lastStatus = r.status;
        }
        report("5th wrong attempt is still a normal 401 (not yet locked)", lastStatus === 401, `got ${lastStatus}`);

        const blocked = await call("POST", "/api/auth/login", {
            body: { school_id: 90001, username: "student_a2", password: PASSWORD },
        });
        report("6th attempt is rate-limited even with the correct password", blocked.status === 403, `got ${blocked.status}`);
    }

    console.log("\n--- Auth basics ---");
    expectStatus("no token -> 401", await call("GET", "/api/admin/students"), 401);
    expectStatus("garbage token -> 401", await call("GET", "/api/admin/students", { token: "not-a-real-token" }), 401);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed) {
        console.log("Failures:");
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
}

main().catch(e => {
    console.error("\nTest run aborted:", e.message);
    process.exit(1);
});
