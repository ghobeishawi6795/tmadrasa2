-- Lets a teacher create/rename subjects (bank tabs) from the question bank
-- itself, without needing admin -- subjects.create/update already exist as
-- permission rows (seeds.sql), just never granted to the teacher role.
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'teacher'), id FROM permissions
WHERE key IN ('subjects.create', 'subjects.update');

-- Preserves the ORIGINAL styled HTML block for a bank question that was
-- created via HTML import, so the bank can show an exact-original preview
-- (eye icon) instead of only the flattened plain-text version used for
-- grading. import_style is the uploaded file's shared <style> block,
-- duplicated per question row (simplest correct option -- these files are
-- small and this avoids a separate import-batches table).
ALTER TABLE questions ADD COLUMN import_html TEXT;
ALTER TABLE questions ADD COLUMN import_style TEXT;
