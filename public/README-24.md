# README-24 — تکلیف چندسؤالی + پیش‌نمایش رنگی HTML (v15)

## مشکلی که حل شد
تا قبل از این نسخه، وقتی یک فایل HTML شامل چند سؤالِ تکلیف (match/drag_drop/audio/draw/...) وارد می‌شد، هر سؤال یک **تکلیف جداگانه** می‌ساخت — یعنی وارد کردن یک فایل ۳۰ سؤالی، ۳۰ ردیف تو لیست «تکالیف» معلم و دانش‌آموز می‌ساخت. علاوه بر این، ظاهر رنگی/زیبایی که فایل HTML اصلی داشت (اگه AI باهاش ساخته بود) اصلاً به دانش‌آموز نشون داده نمی‌شد؛ فقط متن خام و خشکِ استخراج‌شده دیده می‌شد.

## چیزی که عوض شد

### ۱) یک آپلود = یک تکلیف (با چند سؤال داخلش)
اگه فایل بیش از یک بلوک `data-target="assignment"` داشته باشه، همه‌شون تبدیل به **یک** ردیف تکلیف می‌شن که وقتی دانش‌آموز بازش می‌کنه، سؤال‌ها پشت سر هم داخلش هستن. (فایلی که فقط یک بلوک تکلیف داره، دقیقاً مثل قبل رفتار می‌کنه — تکلیف تک‌سؤالی معمولی.)
- نمره‌گذاری: هر سؤال جدا حساب می‌شه (خودکار برای تطبیق/دسته‌بندی، دستی برای بقیه) و در نهایت جمع و نرمالایز می‌شه به نمره‌ی کامل تکلیف (پیش‌فرض ۲۰).
- تا وقتی همه‌ی سؤال‌های نیازمند تصحیح دستی تصحیح نشدن، نمره‌ی نهایی محاسبه نمی‌شه (دقیقاً مثل منطق تصحیح دستی امتحانات که از قبل تو پروژه بود).
- همه‌ی بلوک‌های تکلیف تو یک فایل باید هم‌درس (`data-subject` یکسان) باشن؛ ناهم‌خوان رد می‌شه با دلیل مشخص.

### ۲) پیش‌نمایش رنگی HTML — دانش‌آموز همون ظاهر اصلی رو می‌بینه
- پرامپت آماده (`docs/راهنمای-وارد-کردن-html.md`) عوض شد: دیگه منع نمی‌کنه از `<style>`/رنگ/دیو تزئینی — بلکه صریحاً تشویق می‌کنه.
- پارسر HTML (`_shared/html-import.js`) از یه regex ساده که با اولین `</div>` تداخل تودرتو رو خراب می‌کرد، به یک اسکنر عمق‌دار (depth-tracking) تغییر کرد تا دیوهای تزئینی تودرتو رو درست بخونه. تشخیص کلاس‌های لازم (`q-text`, `q-options`, ...) هم منعطف شد — کلاس‌های تزئینی اضافه دیگه پارس رو خراب نمی‌کنن.
- هر `<style>` پیدا شده تو فایل + خودِ بلوک HTML هر سؤال (پاک‌سازی‌شده از `<script>`/`<link>`/`on*=`/`javascript:`) ذخیره می‌شه، و به دانش‌آموز داخل یک `<iframe sandbox="">` نشون داده می‌شه — یعنی هیچ اسکریپتی توش اجرا نمی‌شه (کاملاً ایزوله)، ولی رنگ/چیدمان/آیکون‌ها همون‌طور که تو فایل اصلی بودن دیده می‌شن.
- **نکته‌ی امنیتی مهم:** برای سؤال‌های تطبیق/دسته‌بندی، لیست‌های `q-pairs`/`q-buckets`/`q-items` (که جواب درست توشونه) قبل از ذخیره حذف می‌شن — این دو نوع همیشه با همون ابزار تعاملی امن قبلی (بدون لو رفتن جواب) از دانش‌آموز پاسخ می‌گیرن، فقط بقیه‌ی ظاهر رنگی (مثلاً توضیحات/آیکون بالای سؤال) نمایش داده می‌شه.
- تو فرم وارد کردن، دکمه‌ی «👁️ پیش‌نمایش ظاهر فایل» هم اضافه شد تا معلم قبل از ثبت، ظاهر رنگی فایل رو تو یه iframe ایزوله (بدون هیچ اسکریپتی) ببینه.

## تغییرات فنی
- **مایگریشن جدید (باید دستی تو D1 اجرا بشه): `database/migrations/016_multi_question_assignments.sql`** — دو ستون جدید رو `assignments` (`is_multi_question`, `prompt_style`) + دو جدول جدید: `assignment_questions` (سؤال‌های داخل یک تکلیف چندسؤالی) و `submission_answers` (پاسخ هر دانش‌آموز به هر سؤال).
- `_shared/html-import.js`: بازنویسی کامل پارسر (اسکنر عمق‌دار برای دیوهای تودرتو، تشخیص منعطف کلاس‌ها، استخراج `<style>` و بلوک خام هر سؤال، پاک‌سازی امنیتی، حذف لیست‌های جواب‌دار برای تطبیق/دسته‌بندی).
- `teacher/import-html.js`: اگه بیش از یک بلوک تکلیف باشه، به‌جای درج تکی، یک ردیف `assignments` (با `is_multi_question=1`) + N ردیف `assignment_questions` می‌سازه. فایل با دقیقاً یک بلوک تکلیف، مثل قبل رفتار می‌کنه (بدون تغییر رفتار قدیمی).
- سه اندپوینت جدید:
  - `student/assignment-detail.js` (GET؟id=) — جزئیات کامل یک تکلیف چندسؤالی برای دانش‌آموز (جواب‌های تطبیق/دسته‌بندی همیشه پاک‌سازی‌شده، بدون کلید جواب).
  - `student/multi-submissions.js` (POST) — ثبت پاسخ همه‌ی سؤال‌های یک تکلیف چندسؤالی در یک درخواست؛ سؤال‌های خودکار فوراً نمره می‌گیرن، بقیه منتظر تصحیح معلم می‌مونن.
  - `teacher/submission-answers.js` (GET/POST) — مشاهده و تصحیح دستی تک‌تک سؤال‌های یک پاسخ چندسؤالی؛ وقتی همه تصحیح شدن، نمره‌ی نهایی محاسبه و با `grades` سینک می‌شه (دقیقاً مثل الگوی تصحیح دستی امتحانات).
- `teacher/assignments.js` و `student/assignments.js`: کوئری GET یک ستون `question_count`/`is_multi_question` اضافه گرفتن تا فرانت بتونه تشخیص بده کدوم تکلیف چندسؤالیه.
- `app.js`: تابع مشترک جدید `mountPromptFrame()` — نصب امنِ HTML رنگی وارد شده داخل یک `<iframe sandbox="">` (بدون هیچ اجرای اسکریپتی)، هم تو پیشخوان معلم (تصحیح) هم دانش‌آموز (پاسخ‌دهی) استفاده می‌شه.
- `teacher/index.html` و `student/index.html`: توابع کاملاً جدید و مجزا برای تکلیف چندسؤالی (`openMultiSubmissionsList`, `openMultiSubmissionAnswers`, `openMultiAssignmentDetail`, و نسخه‌ی مخصوص هر سؤال از canvas/ضبط‌صدا/تطبیق/دسته‌بندی) — بدون دست زدن به منطق قبلیِ تکلیف تک‌سؤالی (که دقیقاً مثل قبل کار می‌کنه).

## مایگریشن لازم (اجرا کن تو D1)
فایل کامل: `database/migrations/016_multi_question_assignments.sql` — یا خلاصه‌اش:
```sql
ALTER TABLE assignments ADD COLUMN is_multi_question INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN prompt_style TEXT;

CREATE TABLE assignment_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id),
    order_index INTEGER NOT NULL,
    submission_type TEXT NOT NULL,
    question_payload TEXT,
    prompt_html TEXT,
    prompt_text TEXT,
    weight REAL NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assignment_questions_assignment ON assignment_questions(assignment_id);

CREATE TABLE submission_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id),
    assignment_question_id INTEGER NOT NULL REFERENCES assignment_questions(id),
    answer_data TEXT,
    score REAL,
    max_score REAL NOT NULL DEFAULT 1,
    needs_manual_review INTEGER NOT NULL DEFAULT 1,
    feedback TEXT,
    graded_at TEXT
);
CREATE INDEX idx_submission_answers_submission ON submission_answers(submission_id);
CREATE UNIQUE INDEX idx_submission_answers_unique ON submission_answers(submission_id, assignment_question_id);
```

## نکات برای دفعه‌ی بعد (اگه لازم شد برگردم بهش)
- تکلیف‌های تک‌سؤالیِ قبلی و همین‌طور تکالیفی که دستی (نه از HTML) ساخته می‌شن، کاملاً بدون تغییر مثل قبل کار می‌کنن — `is_multi_question` پیش‌فرضش ۰ هست.
- پیش‌نمایش رنگی فقط برای **تکلیف**‌های وارد شده از HTML پیاده شده، نه برای سؤال‌های بانک آزمون — اگه بعداً خواستی همین ظاهر رو موقع دادن امتحان هم پیاده کنی، همون الگوی `mountPromptFrame`/`prompt_html` قابل استفاده مجدده، ولی برای امتحان باید مراقب لو نرفتن گزینه‌ی صحیح چندگزینه‌ای هم بود (مثل کاری که برای تطبیق/دسته‌بندی انجام شد).
- iframe پیش‌نمایش با `sandbox=""` (بدون `allow-same-origin`) رندر می‌شه، پس ارتفاعش رو نمی‌شه از محتوای داخلش اندازه گرفت (محدودیت امنیتی خودِ مرورگره) — فعلاً یک ارتفاع ثابت با اسکرول داخلی گذاشته شده؛ اگه لازم شد ارتفاع پویا داشته باشه، راهش `postMessage` از داخل iframe به صفحه‌ی اصلیه (که نیاز به کمی اسکریپت غیرخطرناک داخل iframe داره، نه در سطح sandbox فعلی).
