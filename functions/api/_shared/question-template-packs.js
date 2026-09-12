// «قالب‌های آماده» -- چند بستهٔ نمونهٔ سؤال به تفکیک پایه/درس، برای معلم‌های
// تازه‌کار که بانک سؤالشون خالیه. ایده و ساختار از دبستان پورت شده
// (_lib/question-templates.js)، ولی محتوای هر سؤال با انواع سؤالی که
// مدرسه واقعاً پشتیبانی می‌کنه (multiple_choice/true_false/numeric/
// short_answer/long_answer) بازنویسی شده -- دبستان انواعی مثل fill_blank/
// ordering/matching هم داره که مدرسه (در بانک سؤال آزمون) نداره.
//
// هر آیتم اینجا دقیقاً هم‌شکل بدنه‌ی POST /api/teacher/questions هست، تا
// مستقیم به createQuestionRecord() پاس داده بشه بدون هیچ تبدیل اضافه‌ای.

export const TEMPLATE_PACKS = [
    {
        id: "math-grade2",
        name: "ریاضی — پایهٔ دوم",
        description: "جمع و تفریق ساده، مقایسهٔ اعداد، و اعداد نوشتاری.",
        questions: [
            { type: "multiple_choice", text: "۵ + ۳ چند می‌شه؟", chapter: "جمع و تفریق", difficulty: "easy", tags: "جمع",
              options: [{ text: "۶" }, { text: "۷" }, { text: "۸", is_correct: true }, { text: "۹" }] },
            { type: "true_false", text: "۱۰ از ۵ بزرگ‌تره.", correct_boolean: true, chapter: "مقایسهٔ اعداد", difficulty: "easy", tags: "مقایسه" },
            { type: "numeric", text: "۹ - ۴ = ؟", correct_numeric: 5, numeric_tolerance: 0, chapter: "جمع و تفریق", difficulty: "easy", tags: "تفریق" },
            { type: "short_answer", text: "عدد بعد از ۹ چیه؟", correct_text: "۱۰", chapter: "شمارش", difficulty: "easy", tags: "شمارش" },
            { type: "short_answer", text: "عدد ۳ رو به حروف بنویس.", correct_text: "سه", chapter: "اعداد نوشتاری", difficulty: "medium", tags: "اعداد نوشتاری" },
        ],
    },
    {
        id: "persian-grade1",
        name: "فارسی — پایهٔ اول",
        description: "آشنایی با حروف، ساخت کلمه، و متضادهای ساده.",
        questions: [
            { type: "multiple_choice", text: "کدوم کلمه با «آ» شروع می‌شه؟", chapter: "حروف", difficulty: "easy", tags: "حروف",
              options: [{ text: "آب", is_correct: true }, { text: "توپ" }, { text: "مار" }, { text: "سیب" }] },
            { type: "true_false", text: "«کتاب» با حرف «ک» شروع می‌شه.", correct_boolean: true, chapter: "حروف", difficulty: "easy", tags: "حروف" },
            { type: "short_answer", text: "جای خالی رو با حرف درست پر کن تا «آفتاب» ساخته بشه: ___ فتاب", correct_text: "آ", chapter: "واژه‌سازی", difficulty: "easy", tags: "واژه‌سازی" },
            { type: "long_answer", text: "یک کلمه بنویس که با حرف «م» شروع بشه.", correct_text: "مثلاً: مادر", chapter: "واژه‌سازی", difficulty: "medium", tags: "واژه‌سازی" },
            { type: "short_answer", text: "متضاد «بزرگ» چیه؟", correct_text: "کوچک", chapter: "متضاد", difficulty: "medium", tags: "متضاد" },
        ],
    },
    {
        id: "science-grade3",
        name: "علوم — پایهٔ سوم",
        description: "حالت‌های ماده، منظومهٔ شمسی، و رشد گیاه.",
        questions: [
            { type: "multiple_choice", text: "کدوم‌یک از این‌ها حالت جامد داره؟", chapter: "حالت‌های ماده", difficulty: "easy", tags: "حالت ماده",
              options: [{ text: "آب" }, { text: "یخ", is_correct: true }, { text: "بخار" }, { text: "هوا" }] },
            { type: "true_false", text: "خورشید یه ستاره‌ست.", correct_boolean: true, chapter: "منظومهٔ شمسی", difficulty: "easy", tags: "منظومه شمسی" },
            { type: "short_answer", text: "گیاهان برای رشد به نور ___ نیاز دارن.", correct_text: "خورشید", chapter: "گیاهان", difficulty: "easy", tags: "گیاهان" },
            { type: "long_answer", text: "یکی از مراحل رشد گیاه رو نام ببر.", correct_text: "مثلاً: بذر، جوانه، نهال یا درخت", chapter: "گیاهان", difficulty: "medium", tags: "گیاهان" },
            { type: "short_answer", text: "ماهی تو کدوم زیستگاه زندگی می‌کنه؟", correct_text: "آب", chapter: "زیستگاه", difficulty: "medium", tags: "زیستگاه" },
        ],
    },
];

export function getTemplatePack(packId) {
    return TEMPLATE_PACKS.find(p => p.id === packId) || null;
}
