// schedule.js — بناء الجدول الأسبوعي، كشف التعارضات، وتقارير الجداول

import * as db from './db.js';
import { WEEKDAYS_AR, WORKING_DAYS } from './hijri.js';
import { reportShell, escapeHTML as esc, generatePDFReport } from './attendance.js';

/** أيام الدراسة: الأحد (0) → الخميس (4) */
export function getWorkingDays() {
  return WORKING_DAYS.map(d => ({ value: d, label: WEEKDAYS_AR[d] }));
}

export function getDayName(dayOfWeek) {
  return WEEKDAYS_AR[dayOfWeek] || '—';
}

/**
 * التحقق من خلية الجدول قبل الحفظ.
 * يُعيد { ok, blocking, warnings }
 */
export async function validateScheduleCell(classId, day, periodId, teacherId, subjectId) {
  const result = { ok: true, blocking: null, warnings: [] };
  if (!teacherId) return result;

  // تعارض: نفس المعلمة في صف آخر بنفس اليوم والحصة
  const conflict = await db.checkConflict(teacherId, day, periodId, classId);
  if (conflict) {
    result.ok = false;
    result.blocking = `المعلمة مشغولة في هذه الحصة لدى صف «${conflict.class_name || 'غير معروف'}».`;
    return result;
  }

  // تحذير: تجاوز النصاب الأسبوعي المكلَّفة به
  const load = await getTeacherWorkload(teacherId);
  const assignments = await db.getAllAssignments({ teacherId });
  const quota = assignments.reduce((s, a) => s + (a.weekly_hours || 0), 0);

  if (quota > 0 && load.totalHours + 1 > quota) {
    result.warnings.push(
      `تجاوز النصاب: الحصص المجدولة ستصبح ${load.totalHours + 1} مقابل نصاب ${quota}.`
    );
  }

  return result;
}

/**
 * شبكة جدول صف: صفوف = الحصص، أعمدة = أيام الدراسة.
 * يُعيد { periods, days, grid } حيث grid[periodId][day] = الخلية أو null
 */
export async function getScheduleGrid(classId) {
  const [periods, cells] = await Promise.all([
    db.getAllPeriods(),
    classId ? db.getScheduleForClass(classId) : Promise.resolve([])
  ]);

  const grid = {};
  for (const p of periods) {
    grid[p.id] = {};
    for (const d of WORKING_DAYS) grid[p.id][d] = null;
  }

  for (const c of cells) {
    if (grid[c.period_id]) grid[c.period_id][c.day_of_week] = c;
  }

  return { periods, days: getWorkingDays(), grid };
}

/** شبكة جدول معلمة عبر كل الصفوف */
export async function getTeacherGrid(teacherId) {
  const [periods, cells] = await Promise.all([
    db.getAllPeriods(),
    teacherId ? db.getScheduleForTeacher(teacherId) : Promise.resolve([])
  ]);

  const grid = {};
  for (const p of periods) {
    grid[p.id] = {};
    for (const d of WORKING_DAYS) grid[p.id][d] = null;
  }
  for (const c of cells) {
    if (grid[c.period_id]) grid[c.period_id][c.day_of_week] = c;
  }

  return { periods, days: getWorkingDays(), grid };
}

/** نصاب المعلمة الفعلي من الجدول */
export async function getTeacherWorkload(teacherId) {
  const cells = await db.getScheduleForTeacher(teacherId);
  const byDay = {};
  for (const d of WORKING_DAYS) byDay[d] = 0;

  const subjects = new Set();
  const classes = new Set();

  for (const c of cells) {
    if (byDay[c.day_of_week] !== undefined) byDay[c.day_of_week]++;
    if (c.subject_name) subjects.add(c.subject_name);
    if (c.class_name) classes.add(c.class_name);
  }

  return {
    totalHours: cells.length,
    byDay,
    subjects: [...subjects],
    classes: [...classes]
  };
}

/* ------------------------------------------------------------------ */
/* تقارير الجداول                                                      */
/* ------------------------------------------------------------------ */

function gridTable(periods, grid, renderCell) {
  const days = getWorkingDays();
  const head = `<tr><th style="width:120px">الحصة</th>${
    days.map(d => `<th>${esc(d.label)}</th>`).join('')}</tr>`;

  const body = periods.map(p => {
    if (p.is_break) {
      return `<tr><th>${esc(p.name)}<div class="muted num">${esc(p.start_time)} – ${esc(p.end_time)}</div></th>
        <td colspan="${days.length}" style="text-align:center;background:#f1f5f9;color:#64748b">استراحة</td></tr>`;
    }
    const cells = days.map(d => {
      const cell = grid[p.id] ? grid[p.id][d.value] : null;
      return `<td>${cell ? renderCell(cell) : '<span class="muted">—</span>'}</td>`;
    }).join('');
    return `<tr><th>${esc(p.name)}<div class="muted num">${esc(p.start_time)} – ${esc(p.end_time)}</div></th>${cells}</tr>`;
  }).join('');

  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** تقرير جدول صف */
export async function generateClassSchedulePDF(classId) {
  const classes = await db.getAllClasses(true);
  const cls = classes.find(c => c.id === Number(classId));
  const { periods, grid } = await getScheduleGrid(classId);

  const body = gridTable(periods, grid, cell => `
    <strong>${esc(cell.subject_name) || 'بدون مادة'}</strong>
    <div class="muted">${esc(cell.teacher_name) || 'بدون معلمة'}</div>
    ${cell.room ? `<div class="muted num">قاعة ${esc(cell.room)}</div>` : ''}`);

  const html = reportShell({
    title: `الجدول الأسبوعي — ${esc(cls ? cls.name : 'صف')}`,
    subtitle: cls && cls.section ? `الشعبة: ${esc(cls.section)}` : '',
    body
  });

  return generatePDFReport(html, 'جدول الصف');
}

/** تقرير جدول معلمة */
export async function generateTeacherSchedulePDF(teacherId) {
  const teacher = await db.getTeacher(teacherId);
  const { periods, grid } = await getTeacherGrid(teacherId);
  const load = await getTeacherWorkload(teacherId);

  const table = gridTable(periods, grid, cell => `
    <strong>${esc(cell.subject_name) || 'بدون مادة'}</strong>
    <div class="muted">${esc(cell.class_name) || 'بدون صف'}</div>
    ${cell.room ? `<div class="muted num">قاعة ${esc(cell.room)}</div>` : ''}`);

  const body = `
    <p class="muted">مجموع الحصص الأسبوعية: <strong class="num">${load.totalHours}</strong>
      ${load.classes.length ? ` — الصفوف: ${esc(load.classes.join('، '))}` : ''}</p>
    ${table}`;

  const html = reportShell({
    title: `جدول المعلمة — ${esc(teacher ? teacher.name : '')}`,
    subtitle: teacher && teacher.specialty ? `التخصص: ${esc(teacher.specialty)}` : '',
    body
  });

  return generatePDFReport(html, 'جدول المعلمة');
}
