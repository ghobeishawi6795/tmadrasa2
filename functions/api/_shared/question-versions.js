import { q } from "./db.js";

// A question's answer-relevant content, frozen at every create/edit into
// question_versions. exam_questions.pinned_version points at the version
// that was live when the question was attached to that exam -- so editing
// a question later never changes what an already-assigned exam shows or
// grades against. Multiple_choice options get a small `local_id` (1-based,
// stable within one snapshot) instead of the live question_options row id,
// because editing deletes and recreates those rows -- a raw row id would
// go stale exactly when we need it not to.

export function buildOptionsSnapshot(options) {
    return JSON.stringify(options.map((o, i) => ({ local_id: i + 1, text: o.text, is_correct: !!o.is_correct })));
}

// Snapshots the CURRENT live state of a question (after it's been
// inserted/updated + its question_options written) into a new
// question_versions row, and returns that new version number.
export async function snapshotQuestionVersion(env, questionId) {
    const db = q(env);
    const question = await db.first(`SELECT * FROM questions WHERE id = ?`, questionId);
    let optionsJson = null;
    if (question.type === "multiple_choice") {
        const opts = await db.all(`SELECT * FROM question_options WHERE question_id = ? ORDER BY id ASC`, questionId);
        optionsJson = buildOptionsSnapshot(opts.results);
    }

    await db.run(
        `INSERT INTO question_versions
            (question_id, version, text, correct_boolean, correct_numeric, numeric_tolerance, correct_text, options_json, grading_mode, custom_html)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        questionId, question.version, question.text,
        question.correct_boolean, question.correct_numeric, question.numeric_tolerance, question.correct_text,
        optionsJson, question.grading_mode, question.custom_html
    );
    return question.version;
}

// Makes sure a snapshot exists for the question's CURRENT live version --
// creates one from live state if it doesn't (covers questions that existed
// before this feature and were never edited since, or a question created
// then attached without any intervening edit). Always returns the version
// number that now definitely has a snapshot.
export async function ensureVersionSnapshot(env, questionId) {
    const db = q(env);
    const question = await db.first(`SELECT version FROM questions WHERE id = ?`, questionId);
    const existing = await db.first(
        `SELECT 1 FROM question_versions WHERE question_id = ? AND version = ?`,
        questionId, question.version
    );
    if (!existing) await snapshotQuestionVersion(env, questionId);
    return question.version;
}

// Loads one frozen snapshot. Returns null if this exam_questions row
// predates versioning (pinned_version is NULL) -- caller falls back to
// the live `questions`/`question_options` tables for those legacy rows.
export async function getQuestionVersion(env, questionId, version) {
    if (!version) return null;
    const db = q(env);
    const row = await db.first(
        `SELECT * FROM question_versions WHERE question_id = ? AND version = ?`,
        questionId, version
    );
    if (!row) return null;
    return { ...row, options: row.options_json ? JSON.parse(row.options_json) : null };
}
