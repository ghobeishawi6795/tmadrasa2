INSERT OR IGNORE INTO permissions(key) VALUES
 ('academic_years.view'),('academic_years.manage'),('student_profiles.view'),('student_profiles.update'),
 ('discipline.view'),('discipline.manage'),('exam_schedule.view'),('exam_schedule.manage'),
 ('parent_requests.view'),('parent_requests.create'),('parent_requests.manage'),
 ('meetings.view'),('meetings.create'),('meetings.manage'),
 ('finance.view'),('finance.manage'),('library.view'),('library.manage'),('reports.view'),('security.manage');
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='admin';
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='teacher' AND p.key IN ('student_profiles.view','discipline.view','discipline.manage','exam_schedule.view','meetings.view','meetings.manage','reports.view');
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='student' AND p.key IN ('student_profiles.view','discipline.view','exam_schedule.view','parent_requests.view','parent_requests.create','meetings.view');
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='parent' AND p.key IN ('student_profiles.view','discipline.view','exam_schedule.view','parent_requests.view','parent_requests.create','meetings.view','meetings.create');
