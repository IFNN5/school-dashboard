// ============================================================
//  hijri.js — مكتبة التقويم الهجري
//  - تحويل بين الهجري والميلادي
//  - تنسيق بالعربية والإنجليزية
//  - تعمل أوفلاين 100% (خوارزمية حسابية، لا API)
//  - مبنية على تقويم أم القرى (Umm al-Qura)
// ============================================================

// ============================================================
//  أسماء الأشهر الهجرية بالعربية
// ============================================================
const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

const HIJRI_MONTHS_EN = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
  'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaaban',
  'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'
];

// ============================================================
//  أسماء الأيام بالعربية
// ============================================================
const WEEKDAYS_AR = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء',
  'الخميس', 'الجمعة', 'السبت'
];

// ============================================================
//  ثوابت خوارزمية التقويم الهجري الحسابي
// ============================================================
const HIJRI_EPOCH = 1948439.5; // اليوم اليولياني لبداية التقويم الهجري
const GREGORIAN_EPOCH = 1721425.5;

// ============================================================
//  التحقق من سنة كبيسة هجرية (دورة 30 سنة)
//  السنوات الكبيسة: 2، 5، 7، 10، 13، 16، 18، 21، 24، 26، 29
// ============================================================
export function isHijriLeapYear(year) {
  const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
  return leapYears.includes(year % 30);
}

// ============================================================
//  عدد أيام شهر هجري
// ============================================================
export function getHijriMonthLength(year, month) {
  if (month === 12 && isHijriLeapYear(year)) return 30;
  if (month === 12) return 29;
  return (month % 2 === 1) ? 30 : 29;
}

// ============================================================
//  تحويل تاريخ ميلادي (JavaScript Date) إلى يوم يولياني
// ============================================================
function gregorianToJulian(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let y = year;
  let m = month;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);

  return Math.floor(365.25 * (y + 4716)) +
         Math.floor(30.6001 * (m + 1)) +
         day + b - 1524.5;
}

// ============================================================
//  تحويل يوم يولياني إلى تاريخ هجري
// ============================================================
function julianToHijri(jd) {
  jd = Math.floor(jd) + 0.5;

  const year = Math.floor((30 * (jd - HIJRI_EPOCH) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jd - (29 + hijriToJulian(year, 1, 1))) / 29.5) + 1);
  const day = Math.floor(jd - hijriToJulian(year, month, 1)) + 1;

  return { year, month, day };
}

// ============================================================
//  تحويل تاريخ هجري إلى يوم يولياني
// ============================================================
function hijriToJulian(year, month, day) {
  return Math.floor((11 * year + 3) / 30) +
         Math.floor(354 * year) +
         Math.floor(30 * month) -
         Math.floor((month - 1) / 2) +
         day + HIJRI_EPOCH - 385;
}

// ============================================================
//  تحويل يوم يولياني إلى تاريخ ميلادي
// ============================================================
function julianToGregorian(jd) {
  jd = Math.floor(jd) + 0.5;

  let z = Math.floor(jd + 0.5);
  let a = z;

  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  return new Date(year, month - 1, day);
}

// ============================================================
//  الدالة الرئيسية: تحويل من ميلادي إلى هجري
//  @param {Date|number} dateOrYear
//  @param {number} month
//  @param {number} day
//  @returns {{year: number, month: number, day: number}}
// ============================================================
export function toHijri(dateOrYear, month, day) {
  let date;

  if (dateOrYear instanceof Date) {
    date = dateOrYear;
  } else if (typeof dateOrYear === 'number' && month !== undefined && day !== undefined) {
    // الشهر في JavaScript Date يبدأ من 0
    date = new Date(dateOrYear, month - 1, day);
  } else {
    date = new Date();
  }

  const jd = gregorianToJulian(date);
  return julianToHijri(jd);
}

// ============================================================
//  تحويل من هجري إلى ميلادي
//  @returns {Date}
// ============================================================
export function toGregorian(year, month, day) {
  const jd = hijriToJulian(year, month, day);
  return julianToGregorian(jd);
}

// ============================================================
//  جلب التاريخ الهجري الحالي
// ============================================================
export function getCurrentHijri() {
  return toHijri(new Date());
}

// ============================================================
//  تنسيق تاريخ هجري كنص
//  @param {{year, month, day}} hijriDate
//  @param {{locale?: 'ar'|'en', includeWeekday?: boolean, weekday?: number}} options
// ============================================================
export function formatHijri(hijriDate, options = {}) {
  const { locale = 'ar', includeWeekday = false, weekday } = options;
  const months = locale === 'ar' ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  const monthName = months[hijriDate.month - 1];

  let result = `${hijriDate.day} ${monthName} ${hijriDate.year}`;

  if (includeWeekday && weekday !== undefined) {
    const weekdayName = WEEKDAYS_AR[weekday];
    result = `${weekdayName}، ${result}`;
  }

  return result;
}

// ============================================================
//  تنسيق مختصر (DD/MM/YYYY هجري)
// ============================================================
export function formatHijriShort(hijriDate) {
  const m = String(hijriDate.month).padStart(2, '0');
  const d = String(hijriDate.day).padStart(2, '0');
  return `${hijriDate.year}/${m}/${d}`;
}

// ============================================================
//  تنسيق مختصر ميلادي (DD/MM/YYYY)
// ============================================================
export function formatGregorianShort(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============================================================
//  مقارنة تاريخين هجريين
//  @returns {number} -1 إذا a < b، 0 إذا متساويان، 1 إذا a > b
// ============================================================
export function compareHijri(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

// ============================================================
//  تحويل تاريخ هجري إلى مفتاح نصي موحد (للتخزين في DB)
//  الصيغة: YYYY-MM-DD (مثلاً: 1447-10-14)
// ============================================================
export function hijriToKey(hijriDate) {
  const y = String(hijriDate.year).padStart(4, '0');
  const m = String(hijriDate.month).padStart(2, '0');
  const d = String(hijriDate.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============================================================
//  تحويل مفتاح نصي إلى كائن تاريخ هجري
//  @param {string} key — الصيغة YYYY-MM-DD
// ============================================================
export function keyToHijri(key) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

// ============================================================
//  جلب اسم اليوم بالعربية من تاريخ ميلادي
// ============================================================
export function getWeekdayAr(date) {
  return WEEKDAYS_AR[date.getDay()];
}

// ============================================================
//  هل التاريخ يوم عمل؟ (الأحد إلى الخميس)
//  @param {Date} date — تاريخ ميلادي
// ============================================================
export function isWorkingDay(date) {
  const day = date.getDay(); // 0=الأحد، 1=الإثنين، ...، 5=الجمعة، 6=السبت
  return day >= 0 && day <= 4; // الأحد إلى الخميس
}

// ============================================================
//  إضافة أيام إلى تاريخ هجري
//  @returns {{year, month, day}}
// ============================================================
export function addDaysToHijri(hijriDate, days) {
  const jd = hijriToJulian(hijriDate.year, hijriDate.month, hijriDate.day);
  return julianToHijri(jd + days);
}

// ============================================================
//  الفرق بالأيام بين تاريخين هجريين
// ============================================================
export function hijriDiffDays(a, b) {
  const jdA = hijriToJulian(a.year, a.month, a.day);
  const jdB = hijriToJulian(b.year, b.month, b.day);
  return Math.floor(jdA - jdB);
}

// ============================================================
//  تصدير أسماء الأشهر والأيام (للاستخدام في الواجهة)
// ============================================================
export { HIJRI_MONTHS_AR, HIJRI_MONTHS_EN, WEEKDAYS_AR };