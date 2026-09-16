// attendance.js — منطق الحضور والإحصاءات وتوليد التقارير للطباعة (PDF عبر window.print)

import * as db from './db.js';
import {
  toHijri, toGregorian, getCurrentHijri, hijriToKey, keyToHijri,
  formatHijri, formatHijriShort, formatGregorianShort, toISODate,
  getWeekdayAr, isWorkingDay, addDaysToHijri, getHijriMonthRange,
  HIJRI_MONTHS_AR
} from './hijri.js';

/* ------------------------------------------------------------------ */
/* الثوابت                                                             */
/* ------------------------------------------------------------------ */

export const ATTENDANCE_STATUSES = {
  present:          'حاضرة',
  late:             'متأخرة',
  excused:          'استئذان',
  sick_leave:       'إجازة مرضية',
  absent:           'غياب بدون عذر',
  official_leave:   'إجازة رسمية',
  official_mission: 'مهمة رسمية'
};

export const STATUS_COLORS = {
  present:          '#16a34a',
  late:             '#f59e0b',
  excused:          '#0ea5e9',
  sick_leave:       '#8b5cf6',
  absent:           '#dc2626',
  official_leave:   '#64748b',
  official_mission: '#0891b2'
};

export const NEEDS_TIME = ['late', 'excused'];
export const COUNTS_AS_ABSENCE = ['sick_leave', 'absent'];
export const HAS_EXCUSE = ['sick_leave', 'excused', 'official_leave', 'official_mission'];

/* ------------------------------------------------------------------ */
/* مساعدات الحالات                                                     */
/* ------------------------------------------------------------------ */

export function getStatusList() {
  return Object.entries(ATTENDANCE_STATUSES).map(([key, label]) => ({
    key, label, color: STATUS_COLORS[key], needsTime: NEEDS_TIME.includes(key)
  }));
}

export function getStatusLabel(key) {
  return ATTENDANCE_STATUSES[key] || '—';
}

export function getStatusColor(key) {
  return STATUS_COLORS[key] || '#94a3b8';
}

export function needsTime(key) {
  return NEEDS_TIME.includes(key);
}

export function countsAsAbsence(key) {
  return COUNTS_AS_ABSENCE.includes(key);
}

export function hasExcuse(key) {
  return HAS_EXCUSE.includes(key);
}

/* ------------------------------------------------------------------ */
/* التواريخ                                                            */
/* ------------------------------------------------------------------ */

export function todayHijriKey() {
  return hijriToKey(getCurrentHijri());
}

/** التنقل بين الأيام: delta بالأيام. يُعيد معلومات اليوم الجديد. */
export function navigateDay(dateKey, delta) {
  const hijri = addDaysToHijri(keyToHijri(dateKey), delta);
  return describeDay(hijriToKey(hijri));
}

/** وصف كامل لليوم: مفاتيح + نصوص معروضة */
export function describeDay(dateKey) {
  const hijri = keyToHijri(dateKey);
  const gregorian = toGregorian(hijri.year, hijri.month, hijri.day);
  return {
    key: dateKey,
    hijri,
    gregorian,
    gregorianISO: toISODate(gregorian),
    hijriLong: formatHijri(hijri, { withWeekday: gregorian }),
    hijriShort: formatHijriShort(hijri),
    gregorianLong: formatGregorianShort(gregorian),
    weekday: getWeekdayAr(gregorian),
    isWorkingDay: isWorkingDay(gregorian)
  };
}

export function checkWorkingDay(dateKey) {
  return describeDay(dateKey).isWorkingDay;
}

/** نطاق الشهر الهجري الحالي — مفيد كفترة افتراضية للتقارير */
export function getCurrentHijriMonthRange() {
  const h = getCurrentHijri();
  return { ...getHijriMonthRange(h.year, h.month), year: h.year, month: h.month,
           label: `${HIJRI_MONTHS_AR[h.month - 1]} ${h.year}هـ` };
}

/* ------------------------------------------------------------------ */
/* كشف اليوم                                                           */
/* ------------------------------------------------------------------ */

/** يبني كشف التسجيل ليوم: كل معلمة نشطة + حالتها المحفوظة إن وُجدت */
export async function getDayRoster(dateKey) {
  const [teachers, records, dayStatus] = await Promise.all([
    db.getAllTeachers(false),
    db.getAttendanceByDate(dateKey),
    db.getDayStatus(dateKey)
  ]);

  const byTeacher = new Map(records.map(r => [r.teacher_id, r]));

  const roster = teachers.map(t => {
    const rec = byTeacher.get(t.id);
    return {
      teacher_id: t.id,
      name: t.name,
      specialty: t.specialty || '',
      status: rec ? rec.status : null,
      time: rec && rec.time ? rec.time : '',
      note: rec && rec.note ? rec.note : '',
      saved: !!rec
    };
  });

  return { roster, dayStatus, day: describeDay(dateKey) };
}

/** حفظ كشف اليوم — يتجاهل من ليس له حالة، ويحذف سجلات مَن أُلغيت حالتها */
export async function saveDayAttendance(dateKey, rows) {
  const day = describeDay(dateKey);
  const toSave = [];
  const toDelete = [];

  for (const row of rows) {
    if (row.status) {
      toSave.push({
        teacher_id: row.teacher_id,
        date_hijri: dateKey,
        date_gregorian: day.gregorianISO,
        status: row.status,
        time: needsTime(row.status) ? (row.time || null) : null,
        note: row.note || null
      });
    } else if (row.saved) {
      toDelete.push(row.teacher_id);
    }
  }

  for (const id of toDelete) await db.deleteAttendance(id, dateKey);
  if (toSave.length) await db.saveAttendanceBulk(toSave);

  return { saved: toSave.length, removed: toDelete.length };
}

/** التحقق قبل الحفظ */
export function validateRoster(rows) {
  const missingStatus = rows.filter(r => !r.status);
  const missingTime = rows.filter(r => r.status && needsTime(r.status) && !r.time);
  return { missingStatus, missingTime, ok: missingTime.length === 0 };
}

/* ------------------------------------------------------------------ */
/* الإحصاءات                                                           */
/* ------------------------------------------------------------------ */

/** ملخص كشف اليوم: عدّاد لكل حالة + غير المسجّلات */
export function summarizeStats(rows) {
  const counts = { unrecorded: 0 };
  for (const key of Object.keys(ATTENDANCE_STATUSES)) counts[key] = 0;

  for (const r of rows) {
    if (r.status && counts[r.status] !== undefined) counts[r.status]++;
    else counts.unrecorded++;
  }

  counts.total = rows.length;
  counts.recorded = counts.total - counts.unrecorded;
  counts.absenceTotal = COUNTS_AS_ABSENCE.reduce((s, k) => s + counts[k], 0);
  return counts;
}

/** نسبة الحضور: (حاضرة + متأخرة) ÷ السجلات المسجّلة */
export function calculatePresenceRate(counts) {
  const recorded = counts.recorded || 0;
  if (!recorded) return 0;
  const attended = (counts.present || 0) + (counts.late || 0);
  return Math.round((attended / recorded) * 1000) / 10;
}

/* ------------------------------------------------------------------ */
/* التقارير — HTML مضمّن يُفتح في نافذة جديدة ثم window.print()         */
/* ------------------------------------------------------------------ */

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusBadge(status) {
  if (!status) return '<span class="badge badge-none">لم تُسجَّل</span>';
  return `<span class="badge" style="background:${getStatusColor(status)}">${esc(getStatusLabel(status))}</span>`;
}

function reportShell({ title, subtitle, body, orientation = 'landscape' }) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, system-ui, sans-serif;
    direction: rtl; color: #1e293b; margin: 0; padding: 18px;
    background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #64748b; }
  h2 { font-size: 14px; margin: 20px 0 8px; padding-right: 8px; border-right: 3px solid #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: right; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .badge { color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; white-space: nowrap; display: inline-block; }
  .badge-none { background: #94a3b8; }
  .cards { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 14px; min-width: 104px; }
  .card .n { font-size: 20px; font-weight: 700; line-height: 1.2; }
  .card .l { font-size: 11px; color: #64748b; }
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: #64748b; }
  .empty { padding: 26px; text-align: center; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 8px; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #cbd5e1;
           font-size: 10.5px; color: #64748b; display: flex; justify-content: space-between; }
  .sign { margin-top: 30px; display: flex; gap: 60px; font-size: 12px; }
  .sign div { flex: 1; }
  .sign span { display: block; margin-top: 30px; border-top: 1px solid #94a3b8; padding-top: 4px; }
  @media print { .noprint { display: none !important; } }
</style>
</head>
<body>
<header>
  <h1>${esc(title)}</h1>
  <div class="sub">${subtitle || ''}</div>
</header>
${body}
<footer>
  <span>لوحة وكيلة المعلمات</span>
  <span>طُبع في ${esc(formatHijriShort(getCurrentHijri()))}هـ</span>
</footer>
<script>
  window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });
<\/script>
</body>
</html>`;
}

/** فتح التقرير في نافذة جديدة وتشغيل الطباعة */
export function generatePDFReport(html, fallbackTitle = 'تقرير') {
  const win = window.open('', '_blank');
  if (!win) {
    alert('تعذّر فتح نافذة التقرير. يرجى السماح بالنوافذ المنبثقة لهذا الموقع.');
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = fallbackTitle;
  return true;
}

function statCards(counts) {
  const items = [
    ['حاضرة', counts.present, STATUS_COLORS.present],
    ['متأخرة', counts.late, STATUS_COLORS.late],
    ['استئذان', counts.excused, STATUS_COLORS.excused],
    ['إجازة مرضية', counts.sick_leave, STATUS_COLORS.sick_leave],
    ['غياب بدون عذر', counts.absent, STATUS_COLORS.absent],
    ['إجازة رسمية', counts.official_leave, STATUS_COLORS.official_leave],
    ['مهمة رسمية', counts.official_mission, STATUS_COLORS.official_mission],
    ['لم تُسجَّل', counts.unrecorded, '#94a3b8']
  ];
  return `<div class="cards">${items.map(([label, n, color]) => `
    <div class="card" style="border-top:3px solid ${color}">
      <div class="n num">${n || 0}</div><div class="l">${label}</div>
    </div>`).join('')}</div>`;
}

/* --- 1) تقرير يومي --- */

export async function generateDailyReport(dateKey) {
  const { roster, dayStatus, day } = await getDayRoster(dateKey);
  const counts = summarizeStats(roster);

  const rows = roster.length ? roster.map((r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.specialty) || '<span class="muted">—</span>'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="num">${esc(r.time) || '—'}</td>
      <td>${esc(r.note) || ''}</td>
    </tr>`).join('') : '';

  const holidayNote = dayStatus && dayStatus.is_holiday
    ? `<p class="muted">هذا اليوم مسجَّل كإجازة: ${esc(dayStatus.holiday_name || 'بدون اسم')}</p>` : '';

  const body = `
    ${holidayNote}
    ${statCards(counts)}
    <p class="muted">نسبة الحضور: <strong class="num">${calculatePresenceRate(counts)}%</strong>
       من أصل <span class="num">${counts.recorded}</span> سجلاً مسجّلاً.</p>
    <h2>كشف اليوم</h2>
    ${rows ? `<table>
      <thead><tr><th style="width:36px">م</th><th>المعلمة</th><th>التخصص</th>
        <th style="width:110px">الحالة</th><th style="width:70px">الوقت</th><th>ملاحظة</th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty">لا توجد معلمات نشطات لعرضها.</div>'}
    <div class="sign"><div>وكيلة المعلمات<span></span></div><div>مديرة المدرسة<span></span></div></div>`;

  return reportShell({
    title: 'تقرير الحضور اليومي',
    subtitle: `${esc(day.hijriLong)} — الموافق ${esc(day.gregorianLong)}`,
    body
  });
}

/* --- 2) تقرير معلمة --- */

export async function generateTeacherReport(teacherId, from, to) {
  const [teacher, stats] = await Promise.all([
    db.getTeacher(teacherId),
    db.getTeacherStats(teacherId, from, to)
  ]);

  if (!teacher) return reportShell({ title: 'تقرير معلمة', subtitle: '', body: '<div class="empty">المعلمة غير موجودة.</div>' });

  const counts = { unrecorded: 0, ...Object.fromEntries(Object.keys(ATTENDANCE_STATUSES).map(k => [k, stats.byStatus[k] || 0])) };
  counts.total = stats.total;
  counts.recorded = stats.total;

  const rows = stats.records.map((r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(formatHijriShort(keyToHijri(r.date_hijri)))}</td>
      <td>${esc(describeDay(r.date_hijri).weekday)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="num">${esc(r.time) || '—'}</td>
      <td>${esc(r.note) || ''}</td>
    </tr>`).join('');

  const body = `
    <h2>بيانات المعلمة</h2>
    <table>
      <tbody>
        <tr><th style="width:120px">الاسم</th><td>${esc(teacher.name)}</td>
            <th style="width:120px">التخصص</th><td>${esc(teacher.specialty) || '—'}</td></tr>
        <tr><th>الهاتف</th><td class="num">${esc(teacher.phone) || '—'}</td>
            <th>البريد</th><td>${esc(teacher.email) || '—'}</td></tr>
        <tr><th>تاريخ التعيين</th><td class="num">${esc(teacher.hire_date) || '—'}</td>
            <th>الحالة</th><td>${teacher.is_active ? 'نشطة' : 'معطّلة'}</td></tr>
      </tbody>
    </table>

    <h2>ملخص الفترة</h2>
    ${statCards(counts)}
    <p class="muted">نسبة الحضور: <strong class="num">${calculatePresenceRate(counts)}%</strong>
      — مجموع أيام الغياب (مرضي + بدون عذر):
      <strong class="num">${(counts.sick_leave || 0) + (counts.absent || 0)}</strong></p>

    <h2>تفصيل السجلات</h2>
    ${rows ? `<table>
      <thead><tr><th style="width:36px">م</th><th style="width:100px">التاريخ الهجري</th>
        <th style="width:80px">اليوم</th><th style="width:110px">الحالة</th>
        <th style="width:70px">الوقت</th><th>ملاحظة</th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty">لا توجد سجلات في هذه الفترة.</div>'}`;

  return reportShell({
    title: `تقرير المعلمة: ${esc(teacher.name)}`,
    subtitle: `الفترة من ${esc(from)} إلى ${esc(to)} هـ`,
    body,
    orientation: 'portrait'
  });
}

/* --- 3) التقرير العام --- */

export async function generateGeneralReport(from, to) {
  const [ranked, general] = await Promise.all([
    db.getTeachersRankedByAbsence(from, to),
    db.getGeneralStats(from, to)
  ]);

  const counts = { unrecorded: 0, ...Object.fromEntries(Object.keys(ATTENDANCE_STATUSES).map(k => [k, general.byStatus[k] || 0])) };
  counts.total = general.total;
  counts.recorded = general.total;

  const rows = ranked.map((r, i) => {
    const absenceTotal = r.absent + r.sick_leave;
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.specialty) || '<span class="muted">—</span>'}</td>
      <td class="num">${r.present}</td>
      <td class="num">${r.late}</td>
      <td class="num">${r.excused}</td>
      <td class="num">${r.sick_leave}</td>
      <td class="num" style="color:${absenceTotal ? '#dc2626' : 'inherit'}">${r.absent}</td>
      <td class="num">${r.official_leave}</td>
      <td class="num">${r.official_mission}</td>
      <td class="num"><strong>${absenceTotal}</strong></td>
    </tr>`;
  }).join('');

  const body = `
    ${statCards(counts)}
    <p class="muted">
      عدد المعلمات النشطات: <strong class="num">${general.activeTeachers}</strong> —
      أيام التسجيل: <strong class="num">${general.daysRecorded}</strong> —
      نسبة الحضور العامة: <strong class="num">${calculatePresenceRate(counts)}%</strong>
    </p>

    <h2>ترتيب المعلمات بالأكثر غياباً</h2>
    ${rows ? `<table>
      <thead><tr>
        <th style="width:34px">م</th><th>المعلمة</th><th>التخصص</th>
        <th>حاضرة</th><th>متأخرة</th><th>استئذان</th><th>مرضية</th>
        <th>بدون عذر</th><th>رسمية</th><th>مهمة</th><th>مجموع الغياب</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty">لا توجد بيانات في هذه الفترة.</div>'}`;

  return reportShell({
    title: 'التقرير العام للحضور',
    subtitle: `الفترة من ${esc(from)} إلى ${esc(to)} هـ`,
    body
  });
}

/* --- 4) تقرير السجل --- */

export async function generateHistoryReport(filters = {}) {
  const records = await db.getAttendanceHistory(filters);

  const rows = records.map((r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(formatHijriShort(keyToHijri(r.date_hijri)))}</td>
      <td>${esc(describeDay(r.date_hijri).weekday)}</td>
      <td>${esc(r.teacher_name)}</td>
      <td>${esc(r.specialty) || '<span class="muted">—</span>'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="num">${esc(r.time) || '—'}</td>
      <td>${esc(r.note) || ''}</td>
    </tr>`).join('');

  const parts = [];
  if (filters.from) parts.push(`من ${esc(filters.from)}`);
  if (filters.to) parts.push(`إلى ${esc(filters.to)}`);
  if (filters.teacherName) parts.push(`المعلمة: ${esc(filters.teacherName)}`);
  if (filters.status) parts.push(`الحالة: ${esc(getStatusLabel(filters.status))}`);

  const body = `
    <p class="muted">عدد السجلات: <strong class="num">${records.length}</strong></p>
    ${rows ? `<table>
      <thead><tr><th style="width:34px">م</th><th style="width:96px">التاريخ الهجري</th>
        <th style="width:76px">اليوم</th><th>المعلمة</th><th>التخصص</th>
        <th style="width:110px">الحالة</th><th style="width:64px">الوقت</th><th>ملاحظة</th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty">لا توجد سجلات مطابقة للفلاتر المحددة.</div>'}`;

  return reportShell({
    title: 'تقرير سجل الحضور',
    subtitle: parts.length ? parts.join(' — ') : 'كل السجلات',
    body
  });
}

/* --- 5) تقرير الإجازات --- */

export async function generateHolidaysReport(from, to) {
  const holidays = await db.getHolidays(from, to);

  const rows = holidays.map((h, i) => {
    const d = describeDay(h.date_hijri);
    return `<tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(d.hijriShort)}</td>
      <td>${esc(d.weekday)}</td>
      <td>${esc(d.gregorianLong)}</td>
      <td>${esc(h.holiday_name) || '<span class="muted">بدون اسم</span>'}</td>
    </tr>`;
  }).join('');

  const body = `
    <p class="muted">عدد أيام الإجازة: <strong class="num">${holidays.length}</strong></p>
    ${rows ? `<table>
      <thead><tr><th style="width:36px">م</th><th style="width:110px">التاريخ الهجري</th>
        <th style="width:90px">اليوم</th><th style="width:150px">الموافق</th><th>المناسبة</th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty">لا توجد إجازات مسجّلة في هذه الفترة.</div>'}`;

  return reportShell({
    title: 'تقرير الإجازات',
    subtitle: `الفترة من ${esc(from)} إلى ${esc(to)} هـ`,
    body,
    orientation: 'portrait'
  });
}

/* --- تقرير الزيارات الصفية --- */

export async function generateVisitsReport(filters = {}) {
  const visits = await db.getAllVisits(filters);

  const rows = visits.map((v, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(formatHijriShort(keyToHijri(v.date_hijri)))}</td>
      <td>${esc(v.teacher_name)}</td>
      <td>${esc(v.class_name) || '—'}</td>
      <td>${esc(v.period_name) || '—'}</td>
      <td>${esc(v.visit_type) || '—'}</td>
      <td class="num">${v.score === null || v.score === undefined ? '—' : v.score}</td>
      <td>${esc(v.strengths) || ''}</td>
      <td>${esc(v.improvements) || ''}</td>
      <td>${esc(v.recommendations) || ''}</td>
    </tr>`).join('');

  const body = `
    <p class="muted">عدد الزيارات: <strong class="num">${visits.length}</strong></p>
    ${rows ? `<table>
      <thead><tr><th style="width:34px">م</th><th style="width:92px">التاريخ</th>
        <th>المعلمة</th><th>الصف</th><th>الحصة</th><th>النوع</th><th style="width:54px">الدرجة</th>
        <th>نقاط القوة</th><th>نقاط التحسين</th><th>التوصيات</th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty">لا توجد زيارات مطابقة للفلاتر المحددة.</div>'}`;

  return reportShell({ title: 'تقرير الزيارات الصفية', subtitle: '', body });
}

export { reportShell, esc as escapeHTML };
