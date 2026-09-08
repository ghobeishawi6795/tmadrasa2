# مدرسه — School Platform (اسکلت اجرایی)

این پروژه روی **Cloudflare Pages Functions + D1** ساخته شده (بدون R2)،
دقیقاً مطابق معماری‌ای که در تاریخچه پروژه مشخص شده بود:
Authentication → RBAC → School Isolation → Resource Ownership → Validation → DB.

## چیزی که در این نسخه کامل و کارکردی ساخته شده

- **دیتابیس**: تمام ۱۰ Migration (schools تا sessions) + `seeds.sql` برای نقش‌ها و Permissionها
- **لایه مشترک** (`functions/api/_shared/`):
  - `response.js` — پاسخ‌های یکسان JSON
  - `db.js` — Wrapper روی D1
  - `crypto.js` — هش پسورد با **PBKDF2** (نه SHA-256 ساده) + هش کردن Session Token
  - `auth.js` — احراز هویت با Bearer Token، هش شدن قبل از جستجو در `sessions.token_hash`، بررسی RBAC
  - `ownership.js` — تمام قوانین «مالکیت» (معلم فقط کلاس خودش، دانش‌آموز فقط کلاس خودش، ...)
  - `validate.js` — اعتبارسنجی ورودی + مدیریت خطا
- **Auth API**: `register-school` (ساخت مدرسه+مدیر اول)، `login` (با Rate Limit روی تلاش‌های ناموفق)، `logout`
- **سیستم آزمون کامل (قدم ۶ نقشه راه شما)**:
  - `teacher/exams.js` — ساخت/ویرایش/انتشار/بستن/حذف آزمون
  - `teacher/questions.js` — بانک سؤال (۵ نوع سؤال)
  - `teacher/exam-questions.js` — اتصال سؤال به آزمون + ترتیب + امتیاز
  - `teacher/grading.js` — تصحیح دستی پاسخ‌های تشریحی/کوتاه
  - `student/exams.js` — لیست و مشاهده آزمون **بدون افشای پاسخ صحیح**
  - `student/exam-attempt.js` — شروع Attempt، ثبت پاسخ، Submit نهایی + تصحیح خودکار سرور-ساید
  - `student/exam-result.js` — نمایش نتیجه
- **نمونه Admin API**: `admin/classes.js`, `admin/students.js`

همه این‌ها همان قوانین امنیتی مستندات را رعایت می‌کنند:
school_id در همه Queryهای حساس، بررسی Ownership جدا از Permission، نمره همیشه سمت سرور محاسبه می‌شود،
سؤالات تشریحی هرگز خودکار نمره نمی‌گیرند.

## قدم ۷ — حضور و غیاب ✅ (تازه اضافه شد)

- `teacher/attendance.js` — ساخت جلسه (با پیش‌فرض «حاضر» برای کل کلاس)، ثبت/ویرایش وضعیت هر دانش‌آموز
- `student/attendance.js` — سوابق و خلاصه حضور خودش
- `parent/attendance.js` — فقط با تأیید رابطه در `parent_students`؛ حدس زدن `student_id` نتیجه‌ای نمی‌دهد

## قدم ۸ — نمرات و کارنامه ✅ (تازه اضافه شد)

- `teacher/grades.js` — ثبت/ویرایش نمره؛ فقط اگر واقعاً همان درس را در همان کلاس تدریس می‌کند و دانش‌آموز واقعاً عضو آن کلاس است
- `_shared/reportcard.js` — محاسبه میانگین وزن‌دار هر درس، همیشه سمت سرور (Frontend نمی‌تواند میانگین را دیکته کند)
- `student/grades.js`, `student/report-card.js` — نمرات و کارنامه خودش (بر اساس دوره نمره‌دهی)
- `parent/grades.js` — فقط با تأیید `parent_students`

## قدم ۹ — تکمیل APIهای والد ✅ (تازه اضافه شد)

- `parent/children.js` — لیست فرزندان (فقط از طریق `parent_students`)
- `parent/dashboard.js` — خلاصه‌ی وضعیت همه فرزندان (تکالیف فعال، آزمون‌های پیش رو، غیبت‌های اخیر)
- `parent/assignments.js`, `parent/exams.js` — فقط وضعیت/نتیجه، هرگز سؤال یا پاسخ صحیح
- `parent/schedule.js` — برنامه هفتگی واقعی کلاس فرزند

## قدم ۱۰ — پیام‌رسانی و اعلان‌ها ✅ (تازه اضافه شد)

- `messages/conversations.js` — ساخت گفتگوی مستقیم/گروهی؛ اعضا فقط از همان مدرسه
- `messages/messages.js` — ارسال، ویرایش/حذف نرم فقط توسط نویسنده، دسترسی فقط برای اعضا
- `notifications/notifications.js` — لیست + شمارنده خوانده‌نشده + علامت‌گذاری خوانده‌شده
- `announcements/announcements.js` — انتشار توسط مدیر/معلم با Target مشخص، نمایش فقط به Target درست
- **اتصال به Eventهای واقعی** (نه دستی): انتشار آزمون → اعلان به دانش‌آموزان کلاس؛ ثبت نمره → اعلان به دانش‌آموز و والدین؛ ثبت غیبت → اعلان به والدین

## چیزی که هنوز باقی مانده (طبق نقشه راه خودتان، قدم ۱۱)

11. Security hardening نهایی (Audit log، حذف کامل وابستگی به `users.role` قدیمی، تست‌های امنیتی end-to-end)، و اتصال Frontend واقعی (فایل دموی `madrese-dashboard.html` همچنان mock است و باید به این APIها وصل شود)

## راه‌اندازی

```bash
npm install -g wrangler
wrangler login
wrangler d1 create madrese
# database_id خروجی رو در wrangler.toml جایگزین کن

for f in database/migrations/*.sql; do
  wrangler d1 execute madrese --remote --file="$f"
done
wrangler d1 execute madrese --remote --file=database/seeds.sql

wrangler pages deploy public
```

اولین حساب مدیر را با `POST /api/auth/register-school` بسازید (فیلدها در همان فایل مشخص است).

## قدم بعدی پیشنهادی
Frontend مدیر/معلم/دانش‌آموز (فایل دمو که فرستادید) را به این APIها وصل کنیم — دقیقاً طبق قدم ۱۱.۲۲ تا ۱۱.۲۷ مستندات خودتان (یک `api.js` مشترک با مدیریت 401/403).
