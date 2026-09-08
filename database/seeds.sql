-- seeds.sql : base roles + permissions
INSERT INTO roles (key, label) VALUES
    ('admin', 'مدیر'),
    ('teacher', 'معلم'),
    ('student', 'دانش‌آموز'),
    ('parent', 'والد');

INSERT INTO permissions (key) VALUES
    ('students.view'), ('students.create'), ('students.update'), ('students.delete'),
    ('teachers.view'), ('teachers.create'), ('teachers.update'), ('teachers.delete'),
    ('classes.view'), ('classes.create'), ('classes.update'), ('classes.delete'),
    ('subjects.view'), ('subjects.create'), ('subjects.update'), ('subjects.delete'),
    ('assignments.view'), ('assignments.create'), ('assignments.update'), ('assignments.delete'),
    ('submissions.view'), ('submissions.grade'),
    ('exams.view'), ('exams.create'), ('exams.update'), ('exams.delete'), ('exams.publish'),
    ('questions.view'), ('questions.create'), ('questions.update'), ('questions.delete'),
    ('exam_attempts.view'), ('exam_attempts.create'),
    ('attendance.view'), ('attendance.create'), ('attendance.update'),
    ('grades.view'), ('grades.create'), ('grades.update'),
    ('messages.view'), ('messages.create'),
    ('announcements.view'), ('announcements.create');

-- admin: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key='admin'), id FROM permissions;

-- teacher
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key='teacher'), id FROM permissions
WHERE key IN (
    'students.view','classes.view','subjects.view',
    'assignments.view','assignments.create','assignments.update','assignments.delete',
    'submissions.view','submissions.grade',
    'exams.view','exams.create','exams.update','exams.delete','exams.publish',
    'questions.view','questions.create','questions.update','questions.delete',
    'exam_attempts.view',
    'attendance.view','attendance.create','attendance.update',
    'grades.view','grades.create','grades.update',
    'messages.view','messages.create','announcements.view'
);

-- student
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key='student'), id FROM permissions
WHERE key IN (
    'assignments.view','submissions.view',
    'exams.view','exam_attempts.view','exam_attempts.create',
    'attendance.view','grades.view',
    'messages.view','messages.create','announcements.view'
);

-- parent (read-only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key='parent'), id FROM permissions
WHERE key IN (
    'assignments.view','exams.view','attendance.view','grades.view',
    'messages.view','messages.create','announcements.view'
);
