# قدم ۳۶ (v19) — «تمرین» برای دانش‌آموز (بدون احتساب نمره)

## ⚠️ مایگریشن جدید لازم است: `025_student_practice.sql`
```sql
ALTER TABLE questions ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;

CREATE TABLE student_practice_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    question_id INTEGER NOT NULL REFERENCES questions(id),
    is_correct INTEGER,
    answered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, question_id)
);

INSERT INTO permissions (key) VALUES ('practice.use');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE key = 'student'), id FROM permissions WHERE key = 'practice.use';
```

## چی اضافه شد
1. **دکمه‌ی 🧪 روی هر سؤال بانک (بانک من)**: معلم با یک کلیک هر سؤالی رو «قابل تمرین» علامت می‌زنه (بدون این‌که نسخه‌ی سؤال بالا بره — درست مثل ⭐ علاقه‌مندی، یک بوکمارک ساده‌ست). اگه سؤال هنوز درس مشخصی نداشته باشه، قبل از فعال‌کردن یه هشدار می‌ده (چون تب‌بندی تمرین دانش‌آموز بر اساس درسه).
2. **منوی جدید «🧪 تمرین» در پنل دانش‌آموز**: دقیقاً همون تب‌بندی درس + زیرتب فصل بانک سؤال معلم رو داره، ولی کاملاً فقط-نمایشی (نه + درس جدید، نه + فصل جدید، نه ویرایش) — فقط سؤال‌هایی که معلمِ همون درس با 🧪 علامت زده، و فقط برای درس‌هایی که واقعاً به کلاس دانش‌آموز تدریس می‌شه.
3. **پاسخ‌دهی تک‌سؤالی و فوری**: زیر هر سؤال یک دکمه‌ی «بررسی پاسخ» هست — بلافاصله معلوم می‌شه درست بوده یا نه (برای چهارگزینه‌ای/درست‌غلط/عددی/جای‌خالیِ خودکار)، به‌همراه توضیح پاسخ و/یا پاسخ نمونه‌ای که معلم موقع ساخت سؤال نوشته. سؤال‌های نیازمند تصحیح دستی (پاسخ کوتاه/تشریحی/HTML تعاملی) فقط «ثبت» می‌شن، بدون درست/نادرست خودکار. دانش‌آموز می‌تونه هر سؤال رو چندبار دوباره امتحان کنه؛ هر بار فقط آخرین نتیجه‌اش جایگزین قبلی می‌شه (نه یک ردیف تازه)، تا این جدول هیچ‌وقت به‌ازای هر تلاش بزرگ نشه.
4. **هیچ اتصالی به نمره نیست**: نه به `grades` وصله، نه به هیچ آزمون/تکلیفی — کاملاً مجزا و همیشه بدون‌نمره.

## تصمیم‌های مهم (طبق درخواست صریح)
- فقط سؤال‌هایی که معلم دستی 🧪 زده در تمرین ظاهر می‌شن (نه کل بانک به‌صورت خودکار).
- نتیجه‌ی هر سؤال فقط برای خودِ دانش‌آموز ذخیره می‌شه تا بعداً برگرده و ببینه (نه لاگ هر تلاش، فقط آخرین نتیجه)، معلم فعلاً به این آمار دسترسی نداره.

## راستی‌آزمایی
همه‌ی فایل‌های بک‌اند با `node --check` و اسکریپت‌های inline هر دو پنل معلم و دانش‌آموز هم همین‌طور — همه سالم. مسیرهای API جدید (`/api/student/practice-subjects`, `/api/student/practice-questions`, `/api/student/practice-submit`, `/api/teacher/toggle-question-practice`) با فایل‌های واقعی بک‌اند مطابقت داده شد.
