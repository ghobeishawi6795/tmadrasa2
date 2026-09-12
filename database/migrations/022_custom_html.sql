-- 022_custom_html.sql
-- Ports item 7 from the دبستان comparison: a question type where the
-- teacher supplies their own HTML/CSS/JS (an interactive mini-app), run
-- for real -- not the decorative, zero-script preview مدرسه's HTML-import
-- already had. This was deliberately deferred multiple times pending an
-- explicit security decision; applying it now on the user's explicit go-ahead.
--
-- Security model (matches دبستان's own, discussed at length with the user):
--   - rendered in <iframe sandbox="allow-scripts">, i.e. NO allow-same-origin,
--     NO allow-top-navigation, NO allow-popups, NO allow-forms -- the iframe
--     gets an opaque origin, can't touch مدرسه's cookies/localStorage/DOM,
--     can't navigate or pop up anything.
--   - grading_mode is hardcoded to 'manual' for this type, not a teacher
--     choice (unlike fill_blank) -- there is no way to make a client-side-
--     reported score tamper-proof against a student's own DevTools, so
--     مدرسه never trusts it automatically, matching دبستان's own precedent
--     (its grading.js always returns autoGraded:false for custom_html too).
--   - the reported value (via postMessage, see docs/) still gets stored and
--     shown to the teacher as a starting point for manual grading, it's
--     just never used to auto-score.

ALTER TABLE questions ADD COLUMN custom_html TEXT;
ALTER TABLE question_versions ADD COLUMN custom_html TEXT;
