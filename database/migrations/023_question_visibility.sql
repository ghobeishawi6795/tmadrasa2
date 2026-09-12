-- 023_question_visibility.sql
-- Ports item 4 from the دبستان comparison list: a teacher can offer a
-- question to the rest of their school's teachers, but only after an
-- admin approves it -- same three-state flow as دبستان's own
-- (private -> pending -> public, reject sends it back to private).
--
-- A teacher can never set visibility to 'public' directly; requesting
-- 'public' is translated to 'pending' in teacher/questions.js. Only
-- admin/moderate-question.js can actually set 'public'.
--
-- One deliberate deviation from دبستان, worth noting: its own
-- list-questions.js scopes the public-bank query WITHOUT a school_id
-- filter (`own === 'public'` skips the school_id check entirely) -- that
-- looks like an unintentional cross-tenant leak in دبستان (any school's
-- public questions visible to any other school's teachers). مدرسه's public
-- bank stays strictly school_id-scoped like everything else in this app --
-- "shared within this school", not across the whole platform.

ALTER TABLE questions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';

INSERT INTO permissions (key) VALUES ('questions.moderate');
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'admin'), (SELECT id FROM permissions WHERE key = 'questions.moderate');
