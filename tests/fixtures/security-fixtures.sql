-- security-fixtures.sql
-- Test-only data for step 11b (IDOR / cross-school / cross-role security tests).
-- Uses a reserved id range (90000+) so it can be loaded into a real dev/staging
-- D1 database without colliding with real rows, and can be removed afterwards
-- with: DELETE FROM <table> WHERE id >= 90000 / school_id >= 90001 (see bottom).
--
-- All fixture users share the same password: Test@1234
-- (hash below was generated with the exact same PBKDF2 params as crypto.js)

-- ============================= SCHOOL A (id 90001) =============================
INSERT INTO schools (id, name, phone, address) VALUES (90001, 'مدرسه تست A', NULL, NULL);

INSERT INTO users (id, school_id, username, password_hash, full_name) VALUES
    (90011, 90001, 'admin_a',     'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'مدیر A'),
    (90012, 90001, 'teacher_a',   'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'معلم A۱'),
    (90016, 90001, 'teacher_a2',  'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'معلم A۲'),
    (90013, 90001, 'student_a1',  'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'دانش‌آموز A۱'),
    (90014, 90001, 'student_a2',  'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'دانش‌آموز A۲'),
    (90017, 90001, 'student_a3',  'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'دانش‌آموز A۳ (بدون کلاس)'),
    (90015, 90001, 'parent_a',    'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'والد A');

INSERT INTO user_roles (user_id, role_id, school_id) VALUES
    (90011, (SELECT id FROM roles WHERE key='admin'),   90001),
    (90012, (SELECT id FROM roles WHERE key='teacher'), 90001),
    (90016, (SELECT id FROM roles WHERE key='teacher'), 90001),
    (90013, (SELECT id FROM roles WHERE key='student'), 90001),
    (90014, (SELECT id FROM roles WHERE key='student'), 90001),
    (90017, (SELECT id FROM roles WHERE key='student'), 90001),
    (90015, (SELECT id FROM roles WHERE key='parent'),  90001);

INSERT INTO teachers (id, user_id, school_id) VALUES (90012, 90012, 90001), (90016, 90016, 90001);
INSERT INTO students (id, user_id, school_id) VALUES (90013, 90013, 90001), (90014, 90014, 90001), (90017, 90017, 90001);
INSERT INTO parents  (id, user_id, school_id) VALUES (90015, 90015, 90001);

INSERT INTO classes (id, school_id, name, grade) VALUES (90031, 90001, 'کلاس تست A', 'چهارم');
INSERT INTO subjects (id, school_id, name, grade) VALUES (90041, 90001, 'ریاضی تست A', 'چهارم');
INSERT INTO teaching_assignments (id, school_id, teacher_id, class_id, subject_id) VALUES (90051, 90001, 90012, 90031, 90041);

-- student_a3 deliberately NOT enrolled -- used to test "not a class member" rejection
INSERT INTO class_students (class_id, student_id, school_id) VALUES (90031, 90013, 90001), (90031, 90014, 90001);
-- parent_a owns ONLY student_a1 -- student_a2 is used to test "not your child" rejection
INSERT INTO parent_students (parent_id, student_id, school_id) VALUES (90015, 90013, 90001);

-- exam owned by teacher_a (90012)
INSERT INTO exams (id, school_id, class_id, subject_id, teacher_id, title, start_at, end_at, duration_minutes, status, published_at) VALUES
    (90061, 90001, 90031, 90041, 90012, 'آزمون تست A', '2026-01-01 00:00:00', '2026-12-31 23:59:59', 60, 'published', '2026-01-01 00:00:00');
-- exam owned by teacher_a2 (90016) -- same school, DIFFERENT teacher -- used to test same-school ownership
INSERT INTO exams (id, school_id, class_id, subject_id, teacher_id, title, start_at, end_at, duration_minutes, status, published_at) VALUES
    (90063, 90001, 90031, 90041, 90016, 'آزمون تست A2', '2026-01-01 00:00:00', '2026-12-31 23:59:59', 60, 'published', '2026-01-01 00:00:00');

INSERT INTO questions (id, school_id, teacher_id, subject_id, type, text, correct_option_id) VALUES
    (90071, 90001, 90012, 90041, 'multiple_choice', '۲+۲=?', 90081);
INSERT INTO question_options (id, question_id, text, is_correct) VALUES
    (90081, 90071, '۴', 1), (90082, 90071, '۵', 0);
INSERT INTO questions (id, school_id, teacher_id, subject_id, type, text, correct_text) VALUES
    (90074, 90001, 90012, 90041, 'short_answer', 'توضیح بده چرا ۲+۲=۴', 'جمع دو عدد');

INSERT INTO exam_questions (exam_id, question_id, position, score) VALUES (90061, 90071, 1, 10), (90061, 90074, 2, 10);

-- a submitted attempt for student_a1 with one answer still pending manual review
INSERT INTO exam_attempts (id, school_id, exam_id, student_id, attempt_number, status, max_score) VALUES
    (90141, 90001, 90061, 90013, 1, 'submitted', 20);
INSERT INTO exam_answers (id, attempt_id, question_id, text_answer, needs_manual_review) VALUES
    (90151, 90141, 90074, 'چون دو تا دو تا میشه چهارتا', 1);

INSERT INTO grades (id, school_id, student_id, subject_id, teacher_id, source, score, max_score, weight) VALUES
    (90091, 90001, 90013, 90041, 90012, 'manual', 18, 20, 1);

INSERT INTO attendance_sessions (id, school_id, class_id, teacher_id, session_date) VALUES (90101, 90001, 90031, 90012, '2026-06-01');
INSERT INTO attendance_records (id, session_id, student_id, school_id, status) VALUES (90111, 90101, 90013, 90001, 'present');

INSERT INTO conversations (id, school_id, type, title) VALUES (90121, 90001, 'direct', NULL);
INSERT INTO conversation_members (conversation_id, user_id, school_id) VALUES (90121, 90012, 90001), (90121, 90013, 90001);
INSERT INTO messages (id, conversation_id, sender_id, body) VALUES (90131, 90121, 90012, 'سلام، تکلیفت رو دیدم');

-- ============================= SCHOOL B (id 90002) =============================
INSERT INTO schools (id, name, phone, address) VALUES (90002, 'مدرسه تست B', NULL, NULL);

INSERT INTO users (id, school_id, username, password_hash, full_name) VALUES
    (90021, 90002, 'admin_b',    'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'مدیر B'),
    (90022, 90002, 'teacher_b',  'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'معلم B'),
    (90023, 90002, 'student_b1', 'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'دانش‌آموز B۱'),
    (90024, 90002, 'student_b2', 'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'دانش‌آموز B۲'),
    (90025, 90002, 'parent_b',   'pbkdf2$100000$3386ffc6d4f556e7c037c544512fbd76$f999073357dd8038d29545f9b1ef0502966560f9f771781b52719faed71f6875', 'والد B');

INSERT INTO user_roles (user_id, role_id, school_id) VALUES
    (90021, (SELECT id FROM roles WHERE key='admin'),   90002),
    (90022, (SELECT id FROM roles WHERE key='teacher'), 90002),
    (90023, (SELECT id FROM roles WHERE key='student'), 90002),
    (90024, (SELECT id FROM roles WHERE key='student'), 90002),
    (90025, (SELECT id FROM roles WHERE key='parent'),  90002);

INSERT INTO teachers (id, user_id, school_id) VALUES (90022, 90022, 90002);
INSERT INTO students (id, user_id, school_id) VALUES (90023, 90023, 90002), (90024, 90024, 90002);
INSERT INTO parents  (id, user_id, school_id) VALUES (90025, 90025, 90002);

INSERT INTO classes (id, school_id, name, grade) VALUES (90032, 90002, 'کلاس تست B', 'چهارم');
INSERT INTO subjects (id, school_id, name, grade) VALUES (90042, 90002, 'ریاضی تست B', 'چهارم');
INSERT INTO teaching_assignments (id, school_id, teacher_id, class_id, subject_id) VALUES (90052, 90002, 90022, 90032, 90042);
INSERT INTO class_students (class_id, student_id, school_id) VALUES (90032, 90023, 90002), (90032, 90024, 90002);
INSERT INTO parent_students (parent_id, student_id, school_id) VALUES (90025, 90023, 90002);

INSERT INTO exams (id, school_id, class_id, subject_id, teacher_id, title, start_at, end_at, duration_minutes, status, published_at) VALUES
    (90062, 90002, 90032, 90042, 90022, 'آزمون تست B', '2026-01-01 00:00:00', '2026-12-31 23:59:59', 60, 'published', '2026-01-01 00:00:00');

-- ============================= CLEANUP (run after testing) =============================
-- DELETE FROM messages WHERE id >= 90000;
-- DELETE FROM conversation_members WHERE conversation_id >= 90000;
-- DELETE FROM conversations WHERE id >= 90000;
-- DELETE FROM attendance_records WHERE id >= 90000;
-- DELETE FROM attendance_sessions WHERE id >= 90000;
-- DELETE FROM grades WHERE id >= 90000;
-- DELETE FROM exam_answers WHERE id >= 90000;
-- DELETE FROM exam_attempts WHERE id >= 90000;
-- DELETE FROM exam_questions WHERE exam_id >= 90000;
-- DELETE FROM question_options WHERE id >= 90000;
-- DELETE FROM questions WHERE id >= 90000;
-- DELETE FROM exams WHERE id >= 90000;
-- DELETE FROM parent_students WHERE school_id >= 90001;
-- DELETE FROM class_students WHERE school_id >= 90001;
-- DELETE FROM teaching_assignments WHERE id >= 90000;
-- DELETE FROM subjects WHERE id >= 90000;
-- DELETE FROM classes WHERE id >= 90000;
-- DELETE FROM parents WHERE id >= 90000;
-- DELETE FROM students WHERE id >= 90000;
-- DELETE FROM teachers WHERE id >= 90000;
-- DELETE FROM user_roles WHERE user_id >= 90000;
-- DELETE FROM users WHERE id >= 90000;
-- DELETE FROM schools WHERE id >= 90000;
