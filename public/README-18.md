# قدم ۱۸ — فاز ۲ کامل شد: تقویم تعطیلات، برندینگ مدرسه، چاپ کارنامه والد

## چه چیزی اضافه شد

### ۱) خروجی چاپ/PDF کارنامه در پنل والد
- دکمه‌ی «🖨️ چاپ / خروجی PDF» به `public/parent/index.html` اضافه شد (همون الگوی پنل دانش‌آموز، با اضافه‌شدن نام فرزند تو عنوان چون والد ممکنه چند فرزند داشته باشه)
- از همون endpoint موجود `/api/parent/grades` استفاده می‌کنه — بک‌اند تغییری نکرد

### ۲) تقویم تعطیلات مدرسه
- Migration `014_holidays_branding.sql` (جدید) — جدول `school_holidays` + پرمیشن‌های `holidays.view`/`holidays.manage`
- `functions/api/admin/holidays.js` (جدید) — GET/POST/DELETE برای مدیر
- UI در تب «تنظیمات» پنل مدیر: فرم افزودن (تاریخ + عنوان) + لیست با دکمه‌ی حذف
- **هنوز تعطیلات روی حضور و غیاب یا برنامه‌ی هفتگی اثر خودکار نمی‌ذاره** — فقط برای ثبت/نمایش هست، فاز بعدی می‌تونه بهش وصلش کنه

### ۳) برندینگ اختصاصی هر مدرسه (نام/لوگو/رنگ)
- همون migration بالا ستون‌های `logo_data` (base64، حداکثر ۲۰۰KB) و `primary_color` رو به جدول `schools` اضافه کرد + پرمیشن `school.update`
- `functions/api/admin/school.js` (جدید) — GET/PATCH برای مدیر
- `functions/api/school/branding.js` (جدید) — یک endpoint فقط-خواندنی که هر ۴ نقش (مدیر/معلم/دانش‌آموز/والد) بعد از لاگین بهش دسترسی دارن، دقیقاً همون الگوی `/api/student/me` (auth کافیه، پرمیشن جدا لازم نیست)
- `public/assets/js/app.js` → تابع `initShell()` حالا خودکار `applyBranding()` رو صدا می‌زنه: رنگ اصلی (`--primary`/`--primary-soft`) و لوگو رو تو هدر هر ۴ داشبورد پیاده می‌کنه، بدون تکرار کد بین نقش‌ها
- UI مدیریت برندینگ در همون تب «تنظیمات» پنل مدیر (اسم مدرسه، انتخاب‌گر رنگ، آپلود لوگو)

## فایل‌های تغییریافته/جدید
- `database/migrations/014_holidays_branding.sql` (جدید)
- `functions/api/admin/holidays.js` (جدید)
- `functions/api/admin/school.js` (جدید)
- `functions/api/school/branding.js` (جدید)
- `public/admin/index.html` (تب تنظیمات کامل شد: برندینگ + تقویم تعطیلات)
- `public/parent/index.html` (دکمه‌ی چاپ کارنامه اضافه شد)
- `public/assets/js/app.js` (applyBranding + lightenColor)
- `public/assets/js/api.js` (متد `api.patch` اضافه شد — قبلاً نبود)

## نکته‌ی مهم برای دیپلوی
باید migration جدید (`014_holidays_branding.sql`) رو روی D1 اجرا کنی، وگرنه endpoint های جدید با خطای «no such column/table» شکست می‌خورن. از همون روش قبلی (کنسول وب Cloudflare D1) استفاده کن.

## فاز ۲ حالا کامل شد ✅
هر ۴ آیتم باقی‌مونده از قدم ۱۷ انجام شد. طبق roadmap، فاز بعدی (۳) سیستم تکلیف تعاملی (draw/audio/match/drag_drop با auto-grading) هست که هنوز شروع نشده.
