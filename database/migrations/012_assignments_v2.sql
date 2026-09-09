-- 012_assignments_v2.sql
-- Extends assignments/submissions for real use, and fixes a real RBAC gap:
-- "submissions.create" was never defined/granted, so students had no
-- permission to submit their own work.

ALTER TABLE assignments ADD COLUMN submission_type TEXT NOT NULL DEFAULT 'text';
-- text | photo | audio  (interactive question types are a future phase,
-- not implemented yet -- this column is forward-compatible with it)
ALTER TABLE assignments ADD COLUMN question_payload TEXT; -- reserved for future interactive assignments

ALTER TABLE submissions ADD COLUMN answer_data TEXT; -- base64 payload for photo/audio (D1-only: no blob storage, size-capped server-side)
ALTER TABLE submissions ADD COLUMN needs_manual_review INTEGER NOT NULL DEFAULT 1;
-- every submission_type implemented so far (text/photo/audio) needs a human to grade it;
-- only future auto-gradable interactive question types would set this to 0

INSERT INTO permissions (key) VALUES ('submissions.create');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key='student'), (SELECT id FROM permissions WHERE key='submissions.create');
