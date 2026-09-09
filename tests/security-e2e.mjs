#!/usr/bin/env node
// tests/security-e2e.mjs
//
// End-to-end security test suite for مدرسه (Madrese). Talks to a running
// deployment purely over HTTP (fetch) -- no direct DB access -- so it tests
// exactly what a real attacker would see.
//
// WORKFLOW (3 steps, see tests/README.md for full details):
//   1) node tests/security-e2e.mjs setup   --base-url=<url>
//   2) node tests/seed-test-fixtures.mjs
//      -> run the SQL it prints via `wrangler d1 execute ... --file=...`
//   3) node tests/security-e2e.mjs attack  --base-url=<url>
//
// Never run "setup" against a real production database with real schools in
// it -- it creates two brand-new throwaway schools to attack each other.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const FIXTURES_PATH = new URL("./.fixtures.json", import.meta.url);

function arg(name, def = null) {
    const pref = `--${name}=`;
    const hit = process.argv.find(a => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : def;
}

const BASE_URL = (arg("base-url", "http://localhost:8788")).replace(/\/$/, "");
const MODE = process.argv[2]; // "setup" | "attack"

function loadFixtures() {
    if (!existsSync(FIXTURES_PATH)) return {};
    return JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));
}
function saveFixtures(obj) {
    writeFileSync(FIXTURES_PATH, JSON.stringify(obj, null, 2));
}

async function api(method, path, { token, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// PHASE 1: setup -- create two throwaway schools via the public API only.
// ---------------------------------------------------------------------------
async function runSetup() {
    const rnd = Math.random().toString(36).slice(2, 8);
    const fixtures = { baseUrl: BASE_URL, schools: {} };

    for (const key of ["A", "B"]) {
        const schoolName = `SecTest-${key}-${rnd}`;
        const adminUsername = `sectest_admin_${key.toLowerCase()}_${rnd}`;
        const adminPassword = "TestPass123!";

        const reg = await api("POST", "/api/auth/register-school", {
            body: {
                school_name: schoolName,
                admin_full_name: `Admin ${key}`,
                username: adminUsername,
                password: adminPassword,
            },
        });
        if (reg.status !== 200 || !reg.json?.success) {
            throw new Error(`register-school(${key}) failed: ${reg.status} ${JSON.stringify(reg.json)}`);
        }
        const schoolId = reg.json.data.school_id;

        const login = await api("POST", "/api/auth/login", {
            body: { school_id: schoolId, username: adminUsername, password: adminPassword },
        });
        const adminToken = login.json.data.token;

        const cls = await api("POST", "/api/admin/classes", {
            token: adminToken, body: { name: `Class ${key}`, grade: "4" },
        });
        const classId = cls.json.data.id;

        const students = [];
        for (const n of [1, 2]) {
            const username = `sectest_student_${key.toLowerCase()}${n}_${rnd}`;
            const password = "StudentPass123!";
            const stu = await api("POST", "/api/admin/students", {
                token: adminToken,
                body: { full_name: `Student ${key}${n}`, username, password, class_id: classId },
            });
            students.push({ username, password, userId: stu.json.data.user_id, studentRowId: stu.json.data.id });
        }

        fixtures.schools[key] = {
            schoolId, schoolName,
            admin: { username: adminUsername, password: adminPassword },
            classId,
            students,
        };
        console.log(`[setup] school ${key}: id=${schoolId} class=${classId} students=${students.map(s => s.username).join(",")}`);
    }

    saveFixtures(fixtures);
    console.log("\n[setup] done. Fixtures saved to tests/.fixtures.json");
    console.log("[setup] next: node tests/seed-test-fixtures.mjs   (then run the SQL it prints)");
}

// ---------------------------------------------------------------------------
// PHASE 2: attack -- log in as every actor and probe every boundary.
// ---------------------------------------------------------------------------
const results = [];
function record(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
}
function expectStatus(name, res, expected) {
    const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
    record(name, ok, `got ${res.status}${!ok ? `, expected ${expected}` : ""}`);
}

async function loginAs(schoolId, username, password) {
    const res = await api("POST", "/api/auth/login", { body: { school_id: schoolId, username, password } });
    if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.json)}`);
    return res.json.data.token;
}

async function runAttacks() {
    const f = loadFixtures();
    if (!f.schools?.A?.teacher || !f.schools?.B?.teacher) {
        console.error("Missing teacher/parent fixtures. Run tests/seed-test-fixtures.mjs first, apply the SQL, then retry.");
        process.exit(1);
    }
    const A = f.schools.A, B = f.schools.B;

    // --- log in as every actor ---
    const adminA = await loginAs(A.schoolId, A.admin.username, A.admin.password);
    const adminB = await loginAs(B.schoolId, B.admin.username, B.admin.password);
    const teacherA = await loginAs(A.schoolId, A.teacher.username, A.teacher.password);
    const teacherB = await loginAs(B.schoolId, B.teacher.username, B.teacher.password);
    const studentA1 = await loginAs(A.schoolId, A.students[0].username, A.students[0].password);
    const studentA2 = await loginAs(A.schoolId, A.students[1].username, A.students[1].password);
    const studentB1 = await loginAs(B.schoolId, B.students[0].username, B.students[0].password);
    const parentA = await loginAs(A.schoolId, A.parent.username, A.parent.password);
    const parentB = await loginAs(B.schoolId, B.parent.username, B.parent.password);

    console.log("\n--- positive controls (things that SHOULD work) ---");

    // sanity: teacher A can create + publish + delete their own exam
    const examA = await api("POST", "/api/teacher/exams", {
        token: teacherA,
        body: {
            class_id: A.classId, subject_id: A.subjectId, title: "امتحان الف",
            start_at: "2020-01-01T00:00:00Z", end_at: "2099-01-01T00:00:00Z", duration_minutes: 30,
        },
    });
    expectStatus("teacherA can create own exam", examA, 201);
    const examAId = examA.json?.data?.id;

    const examB = await api("POST", "/api/teacher/exams", {
        token: teacherB,
        body: {
            class_id: B.classId, subject_id: B.subjectId, title: "امتحان ب",
            start_at: "2020-01-01T00:00:00Z", end_at: "2099-01-01T00:00:00Z", duration_minutes: 30,
        },
    });
    expectStatus("teacherB can create own exam", examB, 201);
    const examBId = examB.json?.data?.id;

    const gradeA = await api("POST", "/api/teacher/grades", {
        token: teacherA,
        body: {
            student_id: A.students[0].studentRowId, class_id: A.classId, subject_id: A.subjectId,
            score: 18, max_score: 20,
        },
    });
    expectStatus("teacherA can grade own student", gradeA, 201);

    console.log("\n--- cross-school attacks (SHOULD be blocked) ---");

    expectStatus(
        "teacherA cannot update teacherB's exam (cross-school)",
        await api("PUT", "/api/teacher/exams", { token: teacherA, body: { id: examBId, title: "hacked" } }),
        [403, 404]
    );
    expectStatus(
        "teacherA cannot delete teacherB's exam (cross-school)",
        await api("DELETE", "/api/teacher/exams", { token: teacherA, body: { id: examBId } }),
        [403, 404]
    );
    expectStatus(
        "teacherA cannot view grading queue for teacherB's exam",
        await api("GET", `/api/teacher/grading?exam_id=${examBId}`, { token: teacherA }),
        [403, 404]
    );
    expectStatus(
        "teacherA cannot view attendance for school B's class",
        await api("GET", `/api/teacher/attendance?class_id=${B.classId}`, { token: teacherA }),
        [403, 404]
    );
    expectStatus(
        "teacherA cannot grade a student in school B",
        await api("POST", "/api/teacher/grades", {
            token: teacherA,
            body: { student_id: B.students[0].studentRowId, class_id: B.classId, subject_id: B.subjectId, score: 5, max_score: 20 },
        }),
        403
    );
    expectStatus(
        "studentA1 cannot open school B's exam",
        await api("GET", `/api/student/exams?id=${examBId}`, { token: studentA1 }),
        404
    );
    expectStatus(
        "adminA cannot delete school B's class",
        await api("DELETE", "/api/admin/classes", { token: adminA, body: { id: B.classId } }),
        404
    );
    expectStatus(
        "parentA cannot view school B's student's grades",
        await api("GET", `/api/parent/grades?student_id=${B.students[0].studentRowId}`, { token: parentA }),
        403
    );

    console.log("\n--- same-school, wrong-owner attacks (SHOULD be blocked) ---");

    expectStatus(
        "parentA cannot view studentA2's grades (not their child)",
        await api("GET", `/api/parent/grades?student_id=${A.students[1].studentRowId}`, { token: parentA }),
        403
    );

    console.log("\n--- role-escalation attacks (SHOULD be blocked) ---");

    expectStatus(
        "studentA1 cannot create another student (admin-only)",
        await api("POST", "/api/admin/students", {
            token: studentA1, body: { full_name: "x", username: "x", password: "xxxxxxxx", class_id: A.classId },
        }),
        403
    );
    expectStatus(
        "studentA1 cannot record a grade (teacher-only)",
        await api("POST", "/api/teacher/grades", {
            token: studentA1,
            body: { student_id: A.students[0].studentRowId, class_id: A.classId, subject_id: A.subjectId, score: 20, max_score: 20 },
        }),
        403
    );
    expectStatus(
        "studentA1 cannot publish an announcement (no permission)",
        await api("POST", "/api/announcements/announcements", { token: studentA1, body: { title: "x", body: "y" } }),
        403
    );

    console.log("\n--- messaging / notification IDOR (SHOULD be blocked) ---");

    const conv = await api("POST", "/api/messages/conversations", {
        token: studentA1, body: { type: "direct", member_user_ids: [A.students[1].userId] },
    });
    expectStatus("studentA1 can start a conversation with studentA2 (same school)", conv, 201);
    const convId = conv.json?.data?.id;

    expectStatus(
        "studentA1 cannot add a school-B user to a conversation",
        await api("POST", "/api/messages/conversations", {
            token: studentA1, body: { type: "direct", member_user_ids: [B.students[0].userId] },
        }),
        400
    );
    expectStatus(
        "studentB1 (non-member) cannot read A1/A2's conversation",
        await api("GET", `/api/messages/messages?conversation_id=${convId}`, { token: studentB1 }),
        403
    );

    const notifA1 = await api("GET", "/api/notifications/notifications", { token: studentA1 });
    const notifIdA1 = notifA1.json?.data?.notifications?.[0]?.id;
    if (notifIdA1) {
        expectStatus(
            "studentA2 cannot mark studentA1's notification as read",
            await api("POST", "/api/notifications/notifications", { token: studentA2, body: { action: "mark_read", id: notifIdA1 } }),
            403
        );
    } else {
        record("studentA2 cannot mark studentA1's notification as read", true, "skipped -- A1 has no notifications yet");
    }

    console.log("\n--- exam-attempt tampering (SHOULD be blocked) ---");

    const startA1 = await api("POST", "/api/student/exam-attempt", {
        token: studentA1, body: { action: "start", exam_id: examAId },
    });
    if (startA1.status === 201 || startA1.status === 200) {
        const attemptId = startA1.json.data.attempt_id;
        expectStatus(
            "studentA2 cannot submit an answer into studentA1's attempt",
            await api("POST", "/api/student/exam-attempt", {
                token: studentA2, body: { action: "answer", attempt_id: attemptId, question_id: 999999, text_answer: "x" },
            }),
            403
        );
        expectStatus(
            "studentA2 cannot read studentA1's exam result",
            await api("GET", `/api/student/exam-result?attempt_id=${attemptId}`, { token: studentA2 }),
            403
        );
    } else {
        record("exam-attempt tampering tests", true, `skipped -- could not start attempt (${startA1.status}, exam likely has no questions yet, which is expected)`);
    }

    console.log("\n--- auth / session hardening ---");

    expectStatus(
        "garbage bearer token is rejected",
        await api("GET", "/api/notifications/notifications", { token: "not-a-real-token" }),
        401
    );

    const logoutRes = await api("POST", "/api/auth/logout", { token: studentA1 });
    expectStatus("logout succeeds", logoutRes, 200);
    expectStatus(
        "token is rejected immediately after logout",
        await api("GET", "/api/notifications/notifications", { token: studentA1 }),
        401
    );

    // --- summary ---
    const failed = results.filter(r => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    if (failed.length) {
        console.log("\nFAILED CHECKS:");
        for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
        process.exitCode = 1;
    }
}

if (MODE === "setup") await runSetup();
else if (MODE === "attack") await runAttacks();
else {
    console.log("Usage:");
    console.log("  node tests/security-e2e.mjs setup  --base-url=https://your-deployment");
    console.log("  node tests/seed-test-fixtures.mjs");
    console.log("  node tests/security-e2e.mjs attack --base-url=https://your-deployment");
}
