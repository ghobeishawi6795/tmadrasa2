#!/usr/bin/env node
// tests/seed-test-fixtures.mjs
//
// There is currently no admin API endpoint to create teachers, subjects, or
// parents (only /api/admin/students and /api/admin/classes exist). Until
// that's added, this script generates raw SQL to seed one teacher, one
// subject, one teaching-assignment, and one parent per test school directly
// -- ONLY for the two throwaway schools created by `security-e2e.mjs setup`.
//
// Usage:
//   node tests/security-e2e.mjs setup --base-url=<url>   (creates tests/.fixtures.json)
//   node tests/seed-test-fixtures.mjs                    (reads it, writes seed-test-fixtures.sql)
//   wrangler d1 execute <DB_NAME> --file=tests/seed-test-fixtures.sql [--local|--remote]
//   node tests/security-e2e.mjs attack --base-url=<url>

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FIXTURES_PATH = new URL("./.fixtures.json", import.meta.url);
const SQL_OUT_PATH = new URL("./seed-test-fixtures.sql", import.meta.url);

const PBKDF2_ITERATIONS = 100000;
function toHex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial, 256
    );
    return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

function sqlEscape(str) { return str.replace(/'/g, "''"); }

async function main() {
    if (!existsSync(FIXTURES_PATH)) {
        console.error("tests/.fixtures.json not found. Run `node tests/security-e2e.mjs setup --base-url=...` first.");
        process.exit(1);
    }
    const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));
    const statements = [];
    const TEACHER_PASSWORD = "TeacherPass123!";
    const PARENT_PASSWORD = "ParentPass123!";

    for (const key of ["A", "B"]) {
        const s = fixtures.schools[key];
        if (!s) throw new Error(`fixtures missing school ${key} -- rerun setup`);
        const rnd = Math.random().toString(36).slice(2, 8);
        const teacherUsername = `sectest_teacher_${key.toLowerCase()}_${rnd}`;
        const parentUsername = `sectest_parent_${key.toLowerCase()}_${rnd}`;
        const teacherHash = await hashPassword(TEACHER_PASSWORD);
        const parentHash = await hashPassword(PARENT_PASSWORD);

        // Placeholder markers so we can find the auto-generated ids after INSERT
        // via a final SELECT block -- SQLite/D1 don't return ids from batched
        // `wrangler d1 execute --file`, so we look them up by username instead.
        statements.push(`
-- ===== School ${key} (id=${s.schoolId}): teacher + subject + parent =====
INSERT INTO users (school_id, username, password_hash, full_name)
VALUES (${s.schoolId}, '${sqlEscape(teacherUsername)}', '${teacherHash}', 'Teacher ${key}');
INSERT INTO teachers (user_id, school_id)
VALUES ((SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(teacherUsername)}'), ${s.schoolId});
INSERT INTO user_roles (user_id, role_id, school_id)
VALUES (
    (SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(teacherUsername)}'),
    (SELECT id FROM roles WHERE key='teacher'),
    ${s.schoolId}
);

INSERT INTO subjects (school_id, name, grade) VALUES (${s.schoolId}, 'ریاضی تست ${key}', '4');

INSERT INTO teaching_assignments (school_id, teacher_id, class_id, subject_id)
VALUES (
    ${s.schoolId},
    (SELECT id FROM teachers WHERE user_id=(SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(teacherUsername)}')),
    ${s.classId},
    (SELECT id FROM subjects WHERE school_id=${s.schoolId} AND name='ریاضی تست ${key}')
);

INSERT INTO class_teachers (class_id, teacher_id, school_id)
VALUES (
    ${s.classId},
    (SELECT id FROM teachers WHERE user_id=(SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(teacherUsername)}')),
    ${s.schoolId}
);

INSERT INTO users (school_id, username, password_hash, full_name)
VALUES (${s.schoolId}, '${sqlEscape(parentUsername)}', '${parentHash}', 'Parent ${key}');
INSERT INTO parents (user_id, school_id)
VALUES ((SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(parentUsername)}'), ${s.schoolId});
INSERT INTO user_roles (user_id, role_id, school_id)
VALUES (
    (SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(parentUsername)}'),
    (SELECT id FROM roles WHERE key='parent'),
    ${s.schoolId}
);
INSERT INTO parent_students (parent_id, student_id, school_id)
VALUES (
    (SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE school_id=${s.schoolId} AND username='${sqlEscape(parentUsername)}')),
    ${s.students[0].studentRowId},
    ${s.schoolId}
);
`.trim());

        s.teacher = { username: teacherUsername, password: TEACHER_PASSWORD };
        s.parent = { username: parentUsername, password: PARENT_PASSWORD };
        // subjectId gets filled in after the SQL runs (see fetch-subject-ids step below);
        // for now the attack script looks it up right before use if missing.
    }

    writeFileSync(SQL_OUT_PATH, statements.join("\n\n") + "\n");
    writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));

    console.log(`Wrote ${SQL_OUT_PATH.pathname}`);
    console.log("\nStep 1 -- apply it to your D1 database:");
    console.log("  wrangler d1 execute <YOUR_DB_NAME> --file=tests/seed-test-fixtures.sql --remote");
    console.log("  (use --local instead of --remote if you're testing against `wrangler pages dev` locally)");
    console.log("\nStep 2 -- look up the two new subject ids:");
    console.log(`  wrangler d1 execute <YOUR_DB_NAME> --command="SELECT id, school_id, name FROM subjects WHERE name LIKE 'ریاضی تست%'" --remote`);
    console.log("\nStep 3 -- paste them into tests/.fixtures.json:");
    console.log('  fixtures.schools.A.subjectId = <id where school_id matches school A>');
    console.log('  fixtures.schools.B.subjectId = <id where school_id matches school B>');
    console.log("\nThen run: node tests/security-e2e.mjs attack --base-url=<url>");
}

main();
