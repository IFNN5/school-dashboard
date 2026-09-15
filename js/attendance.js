// ============================================================
//  attendance.js — منطق الحضور والتقارير وتوليد PDF
//  - دوال مساعدة للحالات
//  - إحصائيات وحسابات
//  - توليد تقارير PDF بجدول بسيط (عبر طباعة المتصفح)
// ============================================================

import {
  ATTENDANCE_STATUSES,
  STATUSES_NEEDING_TIME,
  STATUSES_COUNTING_AS_ABSENCE,
  STATUSES_WITH_EXCUSE,
  getAttendanceByDate,
  saveAttendanceBulk,
  getAttendanceHistory,
  getTeacherStats,
  getGeneralStats,
  getTeachersRankedByAbsence,
  getHolidays,
  setHoliday,
  removeHoliday,
  getDayStatus,
  getAllTeachers
} from './db.js';

import {
  toHijri,
  toGregorian,
  getCurrentHijri,
  formatHijri,
  formatHijriShort,
  formatGregorianShort,
  hijriToKey,
  keyToHijri,
  getWeekdayAr,
  isWorkingDay,
  addDaysToHijri,
  HIJRI_MONTHS_AR,
  WEEKDAYS_AR
} from './hijri.js';

// ============================================================
//  إعادة تصدير الحالات (لتسهيل الاستيراد في app.js)
// ============================================================
export {
  ATTENDANCE_STATUSES,
  STATUSES_NEEDING_TIME,
  STATUSES_COUNTING_AS_ABSENCE,
  STATUSES_WITH_EXCUSE
};

// ============================================================
//  دوال مساعدة للحالات
// ============================================================

/**
 * هل الحالة تحتاج إلى وقت؟
 */
export function needsTime(status) {
  return STATUSES_NEEDING_TIME.includes(status);
}

/**
 * هل الحالة تُحسب كغياب؟
 */
export function countsAsAbsence(status) {
  return STATUSES_COUNTING_AS_ABSENCE.includes(status);
}

/**
 * هل الحالة بعذر؟
 */
export function hasExcuse(status) {
  return STATUSES_WITH_EXCUSE.includes(status);
}

/**
 * الحصول على لون الحالة (للاستخدام في الواجهة)
 */
export function getStatusColor(status) {
  const colors = {
    present:          '#16a34a',
    late:             '#f59e0b',
    excused:          '#0ea5e9',
    sick_leave:       '#8b5cf6',
    absent:           '#dc2626',
    official_leave:   '#64748b',
    official_mission: '#0891b2'
  };
  return colors[status] || '#64748b';
}

/**
 * الحصول على قائمة الحالات (للاختيار في الواجهة)
 */
export function getStatusList() {
  return Object.entries(ATTENDANCE_STATUSES).map(([key, label]) => ({
    key,
    label,
    needsTime: needsTime(key),
    isAbsence: countsAsAbsence(key),
    hasExcuse: hasExcuse(key),
    color: getStatusColor(key)
  }));
}

// ============================================================
//  توليد مفتاح تاريخ اليوم الهجري
// ============================================================
export function todayHijriKey() {
  return hijriToKey(getCurrentHijri());
}

// ============================================================
//  تنقّل بين الأيام (السابق/التالي)
//  @param {string} dateHijriKey — مفتاح التاريخ الحالي
//  @param {number} delta — عدد الأيام (موجب أو سالب)
//  @returns {string} مفتاح التاريخ الجديد
// ============================================================
export function navigateDay(dateHijriKey, delta) {
  const hijri = keyToHijri(dateHijriKey);
  const newHijri = addDaysToHijri(hijri, delta);
  return hijriToKey(newHijri);
}

// ============================================================
//  التحقق: هل يوم معين هو يوم دراسي؟
//  - ليس جمعة ولا سبت
//  - ليس إجازة مسجّلة
// ============================================================
export async function checkWorkingDay(dateHijriKey) {
  const hijri = keyToHijri(dateHijriKey);
  const greg = toGregorian(hijri.year, hijri.month, hijri.day);

  // تحقق من الجمعة/السبت
  if (!isWorkingDay(greg)) {
    return { isWorking: false, reason: 'نهاية الأسبوع' };
  }

  // تحقق من الإجازات المسجّلة
  const holiday = await getDayStatus(dateHijriKey);
  if (holiday && holiday.is_holiday) {
    return {
      isWorking: false,
      reason: holiday.holiday_name || 'إجازة',
      holiday: holiday
    };
  }

  return { isWorking: true, reason: null };
}

// ============================================================
//  جلب بيانات اليوم الكاملة (للتسجيل الجماعي)
//  @returns {Array} [{ teacher, attendance }]
//  - teacher: بيانات المعلمة
//  - attendance: سجل الحضور إن وُجد
// ============================================================
export async function getDayRoster(dateHijriKey) {
  const teachers = await getAllTeachers(false); // النشطات فقط
  const attendanceRecords = await getAttendanceByDate(dateHijriKey);

  // فهرس سريع
  const attendanceMap = {};
  attendanceRecords.forEach(a => {
    attendanceMap[a.teacher_id] = a;
  });

  return teachers.map(t => ({
    teacher: t,
    attendance: attendanceMap[t.id] || null
  }));
}

// ============================================================
//  حفظ تسجيل جماعي
//  @param {string} dateHijriKey
//  @param {Array} records — [{ teacher_id, status, time, note }]
// ============================================================
export async function saveDayAttendance(dateHijriKey, records) {
  const hijri = keyToHijri(dateHijriKey);
  const greg = toGregorian(hijri.year, hijri.month, hijri.day);
  const dateGregorian = formatGregorianShort(greg);

  const rows = records.map(r => ({
    teacher_id: r.teacher_id,
    date_hijri: dateHijriKey,
    date_gregorian: dateGregorian,
    status: r.status,
    time: r.time || null,
    note: r.note || null
  }));

  return await saveAttendanceBulk(rows);
}

// ============================================================
//  حساب نطاق تاريخي للشهر الحالي الهجري
//  @returns {{ from: string, to: string, year: number, month: number }}
// ============================================================
export function getCurrentHijriMonthRange() {
  const today = getCurrentHijri();
  const year = today.year;
  const month = today.month;

  // أول يوم في الشهر
  const first = { year, month, day: 1 };

  // آخر يوم في الشهر
  let lastDay = 30;
  const test = toGregorian(year, month, 30);
  if (test.getMonth() !== toGregorian(year, month, 1).getMonth()) {
    lastDay = 29;
  }

  return {
    from: hijriToKey(first),
    to: hijriToKey({ year, month, day: lastDay }),
    year,
    month,
    label: `${HIJRI_MONTHS_AR[month - 1]} ${year}`
  };
}

// ============================================================
//  حساب نسبة الحضور من إحصائيات
// ============================================================
export function calculatePresenceRate(stats) {
  if (stats.total === 0) return 0;
  const present = stats.present + stats.late + stats.excused +
                  stats.official_leave + stats.official_mission;
  return Math.round((present / stats.total) * 100);
}

// ============================================================
//  ملخص للعرض في البطاقات
//  @param {Object} stats — من getGeneralStats أو getTeacherStats
// ============================================================
export function summarizeStats(stats) {
  return {
    present: stats.present || 0,
    late: stats.late || 0,
    excused: stats.excused || 0,
    sick_leave: stats.sick_leave || 0,
    absent: stats.absent || 0,
    official_leave: stats.official_leave || 0,
    official_mission: stats.official_mission || 0,
    totalAbsences: (stats.absent || 0) + (stats.sick_leave || 0),
    totalWithExcuse: (stats.sick_leave || 0) + (stats.excused || 0) +
                     (stats.official_leave || 0) + (stats.official_mission || 0),
    presenceRate: calculatePresenceRate(stats),
    total: stats.total || 0
  };
}

// ============================================================
//  ============ توليد تقارير PDF ============
//  نستخدم طباعة المتصفح لضمان ظهور العربية بشكل مثالي
// ============================================================

/**
 * توليد تقرير PDF بجدول بسيط
 * @param {Object} options
 *   - title: عنوان التقرير
 *   - subtitle: عنوان فرعي (اختياري)
 *   - columns: [{ key, label, width? }]
 *   - rows: [{ col_key: value, ... }]
 *   - summary: (اختياري) كائن بملخص يُعرض أعلى الجدول
 *   - meta: (اختياري) معلومات إضافية [{ label, value }]
 */
export function generatePDFReport(options) {
  const {
    title = 'تقرير',
    subtitle = '',
    columns = [],
    rows = [],
    summary = null,
    meta = []
  } = options;

  if (!columns.length) {
    alert('لا توجد أعمدة للتقرير');
    return;
  }

  const now = new Date();
  const hijri = getCurrentHijri();
  const hijriStr = formatHijri(hijri);
  const gregStr = formatGregorianShort(now);

  // بناء صفوف الجدول
  const headerHTML = columns
    .map(c => `<th${c.width ? ` style="width:${c.width}"` : ''}>${escapeHTML(c.label)}</th>`)
    .join('');

  const bodyHTML = rows
    .map(row => {
      const cells = columns.map(c => {
        const value = row[c.key];
        return `<td>${escapeHTML(value === null || value === undefined ? '—' : String(value))}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  // بطاقة الملخص
  let summaryHTML = '';
  if (summary && Array.isArray(summary)) {
    summaryHTML = `
      <div class="summary">
        ${summary.map(s => `
          <div class="summary-card">
            <div class="summary-value">${escapeHTML(String(s.value))}</div>
            <div class="summary-label">${escapeHTML(s.label)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // بطاقات المعلومات الإضافية
  let metaHTML = '';
  if (meta && meta.length > 0) {
    metaHTML = `
      <div class="meta">
        ${meta.map(m => `
          <div class="meta-item">
            <span class="meta-label">${escapeHTML(m.label)}:</span>
            <span class="meta-value">${escapeHTML(String(m.value))}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // صفحة HTML كاملة
  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${escapeHTML(title)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm 12mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, 'Arial', sans-serif;
      direction: rtl;
      text-align: right;
      color: #1e293b;
      background: #ffffff;
      font-size: 11pt;
      padding: 10px;
    }

    .header {
      text-align: center;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }

    .header h1 {
      font-size: 20pt;
      color: #1e293b;
      margin-bottom: 6px;
    }

    .header .subtitle {
      font-size: 12pt;
      color: #64748b;
      margin-bottom: 8px;
    }

    .header .dates {
      font-size: 10pt;
      color: #64748b;
    }

    .header .dates span {
      margin: 0 8px;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 15px;
      padding: 10px 15px;
      background: #f8fafc;
      border-radius: 6px;
      border-right: 3px solid #2563eb;
    }

    .meta-item {
      font-size: 10pt;
    }

    .meta-label {
      color: #64748b;
      font-weight: 600;
      margin-left: 5px;
    }

    .meta-value {
      color: #1e293b;
    }

    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }

    .summary-card {
      flex: 1;
      min-width: 100px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 6px;
      text-align: center;
      border-top: 3px solid #2563eb;
    }

    .summary-value {
      font-size: 18pt;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 4px;
    }

    .summary-label {
      font-size: 9pt;
      color: #64748b;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 10pt;
    }

    thead {
      background: #2563eb;
      color: #ffffff;
    }

    th {
      padding: 8px 10px;
      text-align: right;
      font-weight: 600;
      border: 1px solid #1e40af;
    }

    td {
      padding: 7px 10px;
      text-align: right;
      border: 1px solid #cbd5e1;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    tbody tr:hover {
      background: #e2e8f0;
    }

    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      font-size: 9pt;
      color: #94a3b8;
    }

    .empty-row {
      text-align: center;
      color: #94a3b8;
      padding: 20px;
      font-style: italic;
    }

    @media print {
      body { padding: 0; }
      .summary-card { break-inside: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHTML(title)}</h1>
    ${subtitle ? `<div class="subtitle">${escapeHTML(subtitle)}</div>` : ''}
    <div class="dates">
      <span>${escapeHTML(hijriStr)} هـ</span>
      <span>|</span>
      <span>${escapeHTML(gregStr)} م</span>
    </div>
  </div>

  ${metaHTML}
  ${summaryHTML}

  <table>
    <thead>
      <tr>${headerHTML}</tr>
    </thead>
    <tbody>
      ${rows.length > 0
        ? bodyHTML
        : `<tr><td colspan="${columns.length}" class="empty-row">لا توجد بيانات للعرض</td></tr>`}
    </tbody>
  </table>

  <div class="footer">
    تم إنشاء هذا التقرير تلقائيًا من نظام لوحة وكيلة المعلمات
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 300);
    });
  <\/script>
</body>
</html>
  `;

  // فتح نافذة جديدة لعرض التقرير
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    alert('الرجاء السماح بالنوافذ المنبثقة لطباعة التقرير');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

// ============================================================
//  توليد تقرير يومي
//  @param {string} dateHijriKey
// ============================================================
export async function generateDailyReport(dateHijriKey) {
  const roster = await getDayRoster(dateHijriKey);
  const hijri = keyToHijri(dateHijriKey);
  const greg = toGregorian(hijri.year, hijri.month, hijri.day);
  const hijriLabel = formatHijri(hijri);
  const weekday = getWeekdayAr(greg);

  // بناء صفوف التقرير
  const rows = roster.map(item => ({
    name: item.teacher.name,
    specialty: item.teacher.specialty || '—',
    status: item.attendance ? ATTENDANCE_STATUSES[item.attendance.status] : 'لم يُسجَّل',
    time: item.attendance?.time || '—',
    note: item.attendance?.note || '—'
  }));

  // إحصائيات اليوم
  const stats = {
    present: 0, late: 0, excused: 0, sick_leave: 0,
    absent: 0, official_leave: 0, official_mission: 0, notRecorded: 0
  };

  roster.forEach(item => {
    if (!item.attendance) {
      stats.notRecorded++;
    } else {
      stats[item.attendance.status]++;
    }
  });

  generatePDFReport({
    title: 'تقرير الحضور اليومي',
    subtitle: `${weekday} - ${hijriLabel} هـ`,
    meta: [
      { label: 'عدد المعلمات', value: roster.length },
      { label: 'تم التسجيل', value: roster.length - stats.notRecorded },
      { label: 'لم يُسجَّل', value: stats.notRecorded }
    ],
    summary: [
      { label: 'حاضرة', value: stats.present },
      { label: 'متأخرة', value: stats.late },
      { label: 'استئذان', value: stats.excused },
      { label: 'إجازة مرضية', value: stats.sick_leave },
      { label: 'غياب بدون عذر', value: stats.absent },
      { label: 'إجازة رسمية', value: stats.official_leave },
      { label: 'مهمة رسمية', value: stats.official_mission }
    ],
    columns: [
      { key: 'name', label: 'المعلمة', width: '22%' },
      { key: 'specialty', label: 'التخصص', width: '15%' },
      { key: 'status', label: 'الحالة', width: '18%' },
      { key: 'time', label: 'الوقت', width: '10%' },
      { key: 'note', label: 'ملاحظة', width: '35%' }
    ],
    rows
  });
}

// ============================================================
//  توليد تقرير فترة لمعلمة
// ============================================================
export async function generateTeacherReport(teacherId, teacherName, fromKey, toKey) {
  const stats = await getTeacherStats(teacherId, fromKey, toKey);
  const fromHijri = keyToHijri(fromKey);
  const toHijri = keyToHijri(toKey);

  const summary = summarizeStats(stats);

  generatePDFReport({
    title: 'تقرير أداء معلمة',
    subtitle: teacherName,
    meta: [
      { label: 'من', value: formatHijri(fromHijri) },
      { label: 'إلى', value: formatHijri(toHijri) },
      { label: 'إجمالي الأيام المسجّلة', value: stats.total }
    ],
    summary: [
      { label: 'حاضرة', value: stats.present },
      { label: 'متأخرة', value: stats.late },
      { label: 'استئذان', value: stats.excused },
      { label: 'إجازة مرضية', value: stats.sick_leave },
      { label: 'غياب بدون عذر', value: stats.absent },
      { label: 'إجازة رسمية', value: stats.official_leave },
      { label: 'مهمة رسمية', value: stats.official_mission },
      { label: 'نسبة الحضور', value: summary.presenceRate + '%' }
    ],
    columns: [
      { key: 'status', label: 'الحالة', width: '40%' },
      { key: 'count', label: 'العدد', width: '20%' },
      { key: 'percent', label: 'النسبة', width: '40%' }
    ],
    rows: [
      { status: 'حاضرة', count: stats.present, percent: pct(stats.present, stats.total) },
      { status: 'متأخرة', count: stats.late, percent: pct(stats.late, stats.total) },
      { status: 'استئذان', count: stats.excused, percent: pct(stats.excused, stats.total) },
      { status: 'إجازة مرضية', count: stats.sick_leave, percent: pct(stats.sick_leave, stats.total) },
      { status: 'غياب بدون عذر', count: stats.absent, percent: pct(stats.absent, stats.total) },
      { status: 'إجازة رسمية', count: stats.official_leave, percent: pct(stats.official_leave, stats.total) },
      { status: 'مهمة رسمية', count: stats.official_mission, percent: pct(stats.official_mission, stats.total) }
    ]
  });
}

// ============================================================
//  توليد تقرير عام للفترة (ترتيب بالأكثر غياباً)
// ============================================================
export async function generateGeneralReport(fromKey, toKey, fromLabel, toLabel) {
  const ranked = await getTeachersRankedByAbsence(fromKey, toKey);
  const stats = await getGeneralStats(fromKey, toKey);
  const summary = summarizeStats(stats);

  const rows = ranked.map(r => ({
    name: r.teacher_name,
    specialty: r.teacher_specialty || '—',
    present: r.total_records - r.absences - r.sick_leaves - r.lates - r.excused,
    late: r.lates,
    excused: r.excused,
    sick_leave: r.sick_leaves,
    absent: r.absences,
    totalAbsences: r.total_absences,
    totalRecords: r.total_records
  }));

  generatePDFReport({
    title: 'التقرير العام للحضور والغياب',
    subtitle: `${fromLabel} - ${toLabel}`,
    meta: [
      { label: 'عدد المعلمات', value: ranked.length },
      { label: 'إجمالي السجلات', value: stats.total }
    ],
    summary: [
      { label: 'حاضرة', value: stats.present },
      { label: 'متأخرة', value: stats.late },
      { label: 'استئذان', value: stats.excused },
      { label: 'إجازة مرضية', value: stats.sick_leave },
      { label: 'غياب بدون عذر', value: stats.absent },
      { label: 'نسبة الحضور العام', value: summary.presenceRate + '%' }
    ],
    columns: [
      { key: 'name', label: 'المعلمة', width: '20%' },
      { key: 'specialty', label: 'التخصص', width: '12%' },
      { key: 'present', label: 'حاضرة', width: '9%' },
      { key: 'late', label: 'متأخرة', width: '9%' },
      { key: 'excused', label: 'استئذان', width: '9%' },
      { key: 'sick_leave', label: 'مرضية', width: '9%' },
      { key: 'absent', label: 'غياب', width: '9%' },
      { key: 'totalAbsences', label: 'إجمالي الغياب', width: '12%' },
      { key: 'totalRecords', label: 'إجمالي السجلات', width: '11%' }
    ],
    rows
  });
}

// ============================================================
//  توليد تقرير سجل الحضور (مع فلترة)
// ============================================================
export async function generateHistoryReport(filters, title = 'سجل الحضور والغياب') {
  const records = await getAttendanceHistory(filters);

  const rows = records.map(r => {
    const hijri = keyToHijri(r.date_hijri);
    return {
      date: formatHijri(hijri),
      name: r.teacher_name,
      status: ATTENDANCE_STATUSES[r.status] || r.status,
      time: r.time || '—',
      note: r.note || '—'
    };
  });

  generatePDFReport({
    title,
    columns: [
      { key: 'date', label: 'التاريخ', width: '20%' },
      { key: 'name', label: 'المعلمة', width: '20%' },
      { key: 'status', label: 'الحالة', width: '15%' },
      { key: 'time', label: 'الوقت', width: '10%' },
      { key: 'note', label: 'ملاحظة', width: '35%' }
    ],
    rows
  });
}

// ============================================================
//  توليد تقرير الإجازات
// ============================================================
export async function generateHolidaysReport(fromKey, toKey) {
  const holidays = await getHolidays(fromKey, toKey);

  const rows = holidays.map(h => {
    const hijri = keyToHijri(h.date_hijri);
    const greg = toGregorian(hijri.year, hijri.month, hijri.day);
    return {
      date: formatHijri(hijri),
      weekday: getWeekdayAr(greg),
      name: h.holiday_name || 'إجازة'
    };
  });

  generatePDFReport({
    title: 'تقرير الإجازات الرسمية',
    columns: [
      { key: 'date', label: 'التاريخ الهجري', width: '40%' },
      { key: 'weekday', label: 'اليوم', width: '20%' },
      { key: 'name', label: 'اسم الإجازة', width: '40%' }
    ],
    rows
  });
}

// ============================================================
//  ============ دوال مساعدة داخلية ============
// ============================================================

/**
 * حساب النسبة المئوية
 */
function pct(value, total) {
  if (total === 0) return '0%';
  return Math.round((value / total) * 100) + '%';
}

/**
 * تهريب HTML لمنع الحقن
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
//  إعادة تصدير دوال التقويم (لتسهيل الاستخدام من app.js)
// ============================================================
export {
  formatHijri,
  formatHijriShort,
  formatGregorianShort,
  hijriToKey,
  keyToHijri,
  getWeekdayAr,
  getCurrentHijri,
  toGregorian,
  toHijri,
  HIJRI_MONTHS_AR,
  WEEKDAYS_AR
};