// hijri.js — تحويل التقويم الهجري/الميلادي حسابياً (Tabular Islamic Calendar)
// بدون أي API خارجي. يدعم اختيارياً تقويم أم القرى عبر Intl المدمج في المتصفح.

export const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WORKING_DAYS = [0, 1, 2, 3, 4];

const GREGORIAN_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/* ------------------------------------------------------------------ */
/* وضع التقويم: 'tabular' حسابي بحت | 'umalqura' أم القرى (Intl)       */
/* ------------------------------------------------------------------ */

let CALENDAR_MODE = 'tabular';
let umalquraFormatter = null;

export function setCalendarMode(mode) {
  if (mode === 'umalqura' && supportsUmalqura()) {
    CALENDAR_MODE = 'umalqura';
  } else {
    CALENDAR_MODE = 'tabular';
  }
  return CALENDAR_MODE;
}

export function getCalendarMode() {
  return CALENDAR_MODE;
}

export function supportsUmalqura() {
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC'
    });
    const parts = f.formatToParts(new Date(Date.UTC(2026, 0, 1)));
    return parts.some(p => p.type === 'year');
  } catch (e) {
    return false;
  }
}

function getUmalquraFormatter() {
  if (!umalquraFormatter) {
    umalquraFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC'
    });
  }
  return umalquraFormatter;
}

/* ------------------------------------------------------------------ */
/* اليوم اليولياني (Julian Day Number)                                 */
/* ------------------------------------------------------------------ */

function gregorianToJD(year, month, day) {
  let y = year, m = month;
  if (m < 3) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
}

function jdToGregorian(jd) {
  const z = Math.floor(jd + 0.5);
  let a = Math.floor((z - 1867216.25) / 36524.25);
  a = z + 1 + a - Math.floor(a / 4);
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return { year, month, day };
}

function hijriToJDTabular(year, month, day) {
  return Math.floor((11 * year + 3) / 30)
    + 354 * year
    + 30 * month
    - Math.floor((month - 1) / 2)
    + day + 1948440 - 385;
}

function jdToHijriTabular(jd) {
  const j = Math.floor(jd);
  const year = Math.floor((30 * (j - 1948440) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((j - (29 + hijriToJDTabular(year, 1, 1))) / 29.5) + 1);
  const day = j - hijriToJDTabular(year, month, 1) + 1;
  return { year, month, day };
}

/* ------------------------------------------------------------------ */
/* أم القرى عبر Intl                                                   */
/* ------------------------------------------------------------------ */

function jdToHijriUmalqura(jd) {
  const g = jdToGregorian(jd);
  const dt = new Date(Date.UTC(g.year, g.month - 1, g.day));
  const parts = getUmalquraFormatter().formatToParts(dt);
  const get = (t) => parseInt(parts.find(p => p.type === t).value, 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function hijriToJDUmalqura(year, month, day) {
  // نبدأ من التقدير الحسابي ثم نصحّح بالبحث الخطي (الفرق لا يتجاوز أياماً قليلة)
  let jd = hijriToJDTabular(year, month, day);
  for (let i = 0; i < 12; i++) {
    const h = jdToHijriUmalqura(jd);
    const diff = (h.year - year) * 354.367 + (h.month - month) * 29.53 + (h.day - day);
    if (h.year === year && h.month === month && h.day === day) return jd;
    jd -= diff > 0 ? Math.max(1, Math.round(diff)) : Math.min(-1, Math.round(diff));
  }
  return jd;
}

/* ------------------------------------------------------------------ */
/* الواجهة العامة                                                      */
/* ------------------------------------------------------------------ */

function toJD(hijri) {
  return CALENDAR_MODE === 'umalqura'
    ? hijriToJDUmalqura(hijri.year, hijri.month, hijri.day)
    : hijriToJDTabular(hijri.year, hijri.month, hijri.day);
}

function fromJD(jd) {
  return CALENDAR_MODE === 'umalqura' ? jdToHijriUmalqura(jd) : jdToHijriTabular(jd);
}

/** تحويل تاريخ ميلادي (Date) إلى {year, month, day} هجري */
export function toHijri(date) {
  const d = date instanceof Date ? date : new Date(date);
  const jd = gregorianToJD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return fromJD(jd);
}

/** تحويل تاريخ هجري إلى Date ميلادي (منتصف اليوم محلياً لتفادي مشاكل المناطق الزمنية) */
export function toGregorian(year, month, day) {
  const jd = toJD({ year, month, day });
  const g = jdToGregorian(jd);
  return new Date(g.year, g.month - 1, g.day, 12, 0, 0, 0);
}

/** تاريخ اليوم هجرياً */
export function getCurrentHijri() {
  return toHijri(new Date());
}

/**
 * تنسيق التاريخ الهجري.
 * opts: { withWeekday: Date|null, withYear: true, numeric: false }
 */
export function formatHijri(hijriDate, opts = {}) {
  const { withWeekday = null, withYear = true, numeric = false } = opts;
  const monthName = HIJRI_MONTHS_AR[hijriDate.month - 1] || '';
  let out = numeric
    ? `${pad(hijriDate.day)}/${pad(hijriDate.month)}`
    : `${hijriDate.day} ${monthName}`;
  if (withYear) out += numeric ? `/${hijriDate.year}` : ` ${hijriDate.year}هـ`;
  if (withWeekday instanceof Date) out = `${getWeekdayAr(withWeekday)}، ${out}`;
  return out;
}

/** تنسيق مختصر: 15/09/1447 */
export function formatHijriShort(hijriDate) {
  return `${pad(hijriDate.day)}/${pad(hijriDate.month)}/${hijriDate.year}`;
}

/** تنسيق ميلادي مختصر: 15 مارس 2026 */
export function formatGregorianShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getDate()} ${GREGORIAN_MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

/** تنسيق ميلادي للتخزين: 2026-03-15 */
export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** مفتاح التخزين الهجري: "1447-09-15" */
export function hijriToKey(hijriDate) {
  return `${hijriDate.year}-${pad(hijriDate.month)}-${pad(hijriDate.day)}`;
}

/** عكس hijriToKey */
export function keyToHijri(key) {
  const [year, month, day] = String(key).split('-').map(n => parseInt(n, 10));
  return { year, month, day };
}

/** اسم اليوم بالعربية من تاريخ ميلادي */
export function getWeekdayAr(date) {
  const d = date instanceof Date ? date : new Date(date);
  return WEEKDAYS_AR[d.getDay()];
}

/** هل اليوم من أيام الدراسة (الأحد → الخميس)؟ */
export function isWorkingDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return WORKING_DAYS.includes(d.getDay());
}

/** إضافة أيام (موجبة أو سالبة) لتاريخ هجري */
export function addDaysToHijri(hijriDate, days) {
  return fromJD(toJD(hijriDate) + days);
}

/** الفرق بالأيام بين تاريخين هجريين (a - b) */
export function hijriDiffDays(a, b) {
  return toJD(a) - toJD(b);
}

/** مقارنة تاريخين هجريين: -1 / 0 / 1 */
export function compareHijri(a, b) {
  const d = hijriDiffDays(a, b);
  return d === 0 ? 0 : (d > 0 ? 1 : -1);
}

/** هل السنة الهجرية كبيسة (355 يوماً)؟ */
export function isHijriLeapYear(year) {
  return ((11 * year + 14) % 30) < 11;
}

/** عدد أيام شهر هجري */
export function getHijriMonthLength(year, month) {
  const start = toJD({ year, month, day: 1 });
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = toJD({ year: nextYear, month: nextMonth, day: 1 });
  return end - start;
}

/** أول وآخر يوم في شهر هجري كمفاتيح */
export function getHijriMonthRange(year, month) {
  const len = getHijriMonthLength(year, month);
  return {
    from: hijriToKey({ year, month, day: 1 }),
    to: hijriToKey({ year, month, day: len })
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}
