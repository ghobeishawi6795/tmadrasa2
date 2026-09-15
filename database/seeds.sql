-- Idempotent base RBAC seed. Safe before or after migrations.
INSERT OR IGNORE INTO roles (key, label) VALUES
    ('admin', 'مدیر'),('teacher', 'معلم'),('student', 'دانش‌آموز'),('parent', 'والد');
INSERT OR IGNORE INTO permissions (key) VALUES
    ('students.view'), ('students.create'), ('students.update'), ('students.delete'),
    ('teachers.view'), ('teachers.create'), ('teachers.update'), ('teachers.delete'),
    ('classes.view'), ('classes.create'), ('classes.update'), ('classes.delete'),
    ('subjects.view'), ('subjects.create'), ('subjects.update'), ('subjects.delete'),
    ('assignments.view'), ('assignments.create'), ('assignments.update'), ('assignments.delete'),
    ('submissions.view'), ('submissions.grade'), ('submissions.create'),
    ('exams.view'), ('exams.create'), ('exams.update'), ('exams.delete'), ('exams.publish'),
    ('questions.view'), ('questions.create'), ('questions.update'), ('questions.delete'),
    ('exam_attempts.view'), ('exam_attempts.create'), ('attendance.view'), ('attendance.create'), ('attendance.update'),
    ('grades.view'), ('grades.create'), ('grades.update'), ('messages.view'), ('messages.create'),
    ('announcements.view'), ('announcements.create');
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='admin';
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('students.view','classes.view','subjects.view','assignments.view','assignments.create','assignments.update','assignments.delete','submissions.view','submissions.grade','exams.view','exams.create','exams.update','exams.delete','exams.publish','questions.view','questions.create','questions.update','questions.delete','exam_attempts.view','attendance.view','attendance.create','attendance.update','grades.view','grades.create','grades.update','messages.view','messages.create','announcements.view') WHERE r.key='teacher';
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('assignments.view','submissions.view','submissions.create','exams.view','exam_attempts.view','exam_attempts.create','attendance.view','grades.view','messages.view','messages.create','announcements.view') WHERE r.key='student';
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('assignments.view','exams.view','attendance.view','grades.view','messages.view','messages.create','announcements.view') WHERE r.key='parent';
