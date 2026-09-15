-- 002_roles_permissions.sql : RBAC
CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,      -- admin | teacher | student | parent
    label TEXT NOT NULL
);

CREATE TABLE permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE       -- e.g. students.view
);

CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id),
    permission_id INTEGER NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id),
    role_id INTEGER NOT NULL REFERENCES roles(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_school ON user_roles(school_id);

-- Bootstrap RBAC during migrations so later migrations can safely grant permissions.
-- seeds.sql remains idempotent and can still be run after migrations.
INSERT OR IGNORE INTO roles (key,label) VALUES
 ('admin','مدیر'),('teacher','معلم'),('student','دانش‌آموز'),('parent','والد');
INSERT OR IGNORE INTO permissions(key) VALUES
 ('students.view'),('students.create'),('students.update'),('students.delete'),
 ('teachers.view'),('teachers.create'),('teachers.update'),('teachers.delete'),
 ('classes.view'),('classes.create'),('classes.update'),('classes.delete'),
 ('subjects.view'),('subjects.create'),('subjects.update'),('subjects.delete'),
 ('assignments.view'),('assignments.create'),('assignments.update'),('assignments.delete'),
 ('submissions.view'),('submissions.grade'),('submissions.create'),
 ('exams.view'),('exams.create'),('exams.update'),('exams.delete'),('exams.publish'),
 ('questions.view'),('questions.create'),('questions.update'),('questions.delete'),
 ('exam_attempts.view'),('exam_attempts.create'),('attendance.view'),('attendance.create'),('attendance.update'),
 ('grades.view'),('grades.create'),('grades.update'),('messages.view'),('messages.create'),
 ('announcements.view'),('announcements.create');
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='admin';
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('students.view','classes.view','subjects.view','assignments.view','assignments.create','assignments.update','assignments.delete','submissions.view','submissions.grade','exams.view','exams.create','exams.update','exams.delete','exams.publish','questions.view','questions.create','questions.update','questions.delete','exam_attempts.view','attendance.view','attendance.create','attendance.update','grades.view','grades.create','grades.update','messages.view','messages.create','announcements.view') WHERE r.key='teacher';
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('assignments.view','submissions.view','submissions.create','exams.view','exam_attempts.view','exam_attempts.create','attendance.view','grades.view','messages.view','messages.create','announcements.view') WHERE r.key='student';
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('assignments.view','exams.view','attendance.view','grades.view','messages.view','messages.create','announcements.view') WHERE r.key='parent';
