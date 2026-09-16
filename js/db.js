// ============================================================
//  db.js — طبقة قاعدة البيانات (مع ترحيل تلقائي)
// ============================================================

import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';

let db = null;
let dbInitPromise = null;  // ← قفل لمنع التهيئة المتوازية

// ============================================================
//  حالات الحضور السبع
// ============================================================
export const ATTENDANCE_STATUSES = {
  present:          'حاضرة',
  late:             'متأخرة',
  excused:          'استئذان',
  sick_leave:       'إجازة مرضية',
  absent:           'غياب بدون عذر',
  official_leave:   'إجازة رسمية',
  official_mission: 'مهمة رسمية'
};

export const STATUSES_NEEDING_TIME = ['late', 'excused'];
export const STATUSES_COUNTING_AS_ABSENCE = ['sick_leave', 'absent'];
export const STATUSES_WITH_EXCUSE = ['sick_leave', 'excused', 'official_leave', 'official_mission'];

// ============================================================
//  تهيئة قاعدة البيانات — مع قفل وترحيل تلقائي
// ============================================================
export async function initDB() {
  // إذا كان هناك تهيئة جارية، ارجع نفس الـ Promise
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    console.log('🟢 DB: بدء التهيئة...');
    db = new PGlite('idb://school-dashboard');
    await db.waitReady;
    console.log('🟢 DB: PGlite جاهزة');

    // -------- ترحيل: احذف الجداول القديمة غير المتوافقة --------
    await migrateSchema();

    // -------- إنشاء الجداول بالبنية الجديدة --------
    await db.exec(`
      CREATE TABLE IF NOT EXISTS teachers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT,
        phone TEXT,
        email TEXT,
        hire_date TEXT,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
        date_hijri TEXT NOT NULL,
        date_gregorian TEXT NOT NULL,
        status TEXT NOT NULL,
        time TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, date_hijri)
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS academic_days (
        id SERIAL PRIMARY KEY,
        date_hijri TEXT UNIQUE NOT NULL,
        date_gregorian TEXT NOT NULL,
        is_holiday BOOLEAN DEFAULT false,
        holiday_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // الفهارس
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date_hijri);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance(teacher_id);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_academic_date ON academic_days(date_hijri);`);

    console.log('✅ Database ready (teachers + attendance + academic_days)');
    return db;
  })();

  return dbInitPromise;
}

// ============================================================
//  ترحيل: فحص البنية القديمة وحذف الجداول غير المتوافقة
//  ملاحظة: نفقد البيانات القديمة، لكنها كانت ببنية غير صالحة
// ============================================================
async function migrateSchema() {
  // فحص teachers.is_active
  try {
    await db.query('SELECT is_active FROM teachers LIMIT 0');
  } catch {
    // إما الجدول غير موجود، أو العمود غير موجود
    // نتحقق هل الجدول موجود فعلاً
    try {
      const r = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'teachers'
        ) as exists
      `);
      if (r.rows[0].exists) {
        console.log('🔄 Migration: dropping old teachers table');
        await db.exec('DROP TABLE IF EXISTS teachers CASCADE');
      }
    } catch {}
  }

  // فحص attendance.date_hijri
  try {
    await db.query('SELECT date_hijri FROM attendance LIMIT 0');
  } catch {
    try {
      const r = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'attendance'
        ) as exists
      `);
      if (r.rows[0].exists) {
        console.log('🔄 Migration: dropping old attendance table');
        await db.exec('DROP TABLE IF EXISTS attendance CASCADE');
      }
    } catch {}
  }
}

// ============================================================
//  ============ قسم المعلمات ============
// ============================================================

export async function getAllTeachers(includeInactive = false) {
  const sql = includeInactive
    ? 'SELECT * FROM teachers ORDER BY name ASC'
    : 'SELECT * FROM teachers WHERE is_active = true ORDER BY name ASC';
  const result = await db.query(sql);
  return result.rows;
}

export async function getTeacher(id) {
  const result = await db.query('SELECT * FROM teachers WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function addTeacher(teacher) {
  const result = await db.query(
    `INSERT INTO teachers (name, specialty, phone, email, hire_date, notes, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      teacher.name,
      teacher.specialty || null,
      teacher.phone || null,
      teacher.email || null,
      teacher.hire_date || null,
      teacher.notes || null,
      teacher.is_active !== false
    ]
  );
  return result.rows[0];
}

export async function updateTeacher(id, teacher) {
  const result = await db.query(
    `UPDATE teachers
     SET name = $1, specialty = $2, phone = $3, email = $4,
         hire_date = $5, notes = $6, is_active = $7
     WHERE id = $8 RETURNING *`,
    [
      teacher.name,
      teacher.specialty || null,
      teacher.phone || null,
      teacher.email || null,
      teacher.hire_date || null,
      teacher.notes || null,
      teacher.is_active !== false,
      id
    ]
  );
  return result.rows[0];
}

export async function deleteTeacher(id) {
  await db.query('DELETE FROM teachers WHERE id = $1', [id]);
}

export async function toggleTeacherActive(id, isActive) {
  const result = await db.query(
    'UPDATE teachers SET is_active = $1 WHERE id = $2 RETURNING *',
    [isActive, id]
  );
  return result.rows[0];
}

export async function bulkInsertTeachers(teachers) {
  if (!teachers || teachers.length === 0) return 0;
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const t of teachers) {
      if (!t.name || t.name.trim() === '') continue;
      await tx.query(
        `INSERT INTO teachers (name, specialty, phone, email, hire_date, notes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          t.name.trim(),
          t.specialty || null,
          t.phone || null,
          t.email || null,
          t.hire_date || null,
          t.notes || null,
          true
        ]
      );
      inserted++;
    }
  });
  return inserted;
}

export async function countTeachers(onlyActive = true) {
  const sql = onlyActive
    ? 'SELECT COUNT(*) as total FROM teachers WHERE is_active = true'
    : 'SELECT COUNT(*) as total FROM teachers';
  const result = await db.query(sql);
  return parseInt(result.rows[0].total, 10);
}

// ============================================================
//  ============ قسم الحضور ============
// ============================================================

export async function getAttendanceByDate(dateHijri) {
  const result = await db.query(
    `SELECT a.*, t.name as teacher_name, t.specialty as teacher_specialty
     FROM attendance a
     JOIN teachers t ON t.id = a.teacher_id
     WHERE a.date_hijri = $1
     ORDER BY t.name ASC`,
    [dateHijri]
  );
  return result.rows;
}

export async function saveAttendanceBulk(records) {
  if (!records || records.length === 0) return 0;
  let saved = 0;
  await db.transaction(async (tx) => {
    for (const r of records) {
      if (!r.teacher_id || !r.date_hijri || !r.status) continue;
      await tx.query(
        `INSERT INTO attendance (teacher_id, date_hijri, date_gregorian, status, time, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (teacher_id, date_hijri)
         DO UPDATE SET
           status = EXCLUDED.status,
           time = EXCLUDED.time,
           note = EXCLUDED.note,
           date_gregorian = EXCLUDED.date_gregorian`,
        [
          r.teacher_id,
          r.date_hijri,
          r.date_gregorian,
          r.status,
          r.time || null,
          r.note || null
        ]
      );
      saved++;
    }
  });
  return saved;
}

export async function deleteAttendance(teacherId, dateHijri) {
  await db.query(
    'DELETE FROM attendance WHERE teacher_id = $1 AND date_hijri = $2',
    [teacherId, dateHijri]
  );
}

export async function deleteAttendanceByDate(dateHijri) {
  await db.query('DELETE FROM attendance WHERE date_hijri = $1', [dateHijri]);
}

export async function getAttendanceHistory(filters = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.from) { conditions.push(`a.date_hijri >= $${idx++}`); params.push(filters.from); }
  if (filters.to)   { conditions.push(`a.date_hijri <= $${idx++}`); params.push(filters.to); }
  if (filters.teacher_id) { conditions.push(`a.teacher_id = $${idx++}`); params.push(filters.teacher_id); }
  if (filters.status)     { conditions.push(`a.status = $${idx++}`); params.push(filters.status); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await db.query(
    `SELECT a.*, t.name as teacher_name, t.specialty as teacher_specialty
     FROM attendance a
     JOIN teachers t ON t.id = a.teacher_id
     ${where}
     ORDER BY a.date_hijri DESC, t.name ASC
     LIMIT 1000`,
    params
  );
  return result.rows;
}

export async function getTeacherStats(teacherId, fromDateHijri, toDateHijri) {
  const result = await db.query(
    `SELECT status, COUNT(*) as count
     FROM attendance
     WHERE teacher_id = $1 AND date_hijri >= $2 AND date_hijri <= $3
     GROUP BY status`,
    [teacherId, fromDateHijri, toDateHijri]
  );
  const stats = {
    present: 0, late: 0, excused: 0, sick_leave: 0, absent: 0,
    official_leave: 0, official_mission: 0, total: 0
  };
  result.rows.forEach(row => {
    stats[row.status] = parseInt(row.count, 10);
    stats.total += parseInt(row.count, 10);
  });
  return stats;
}

export async function getGeneralStats(fromDateHijri, toDateHijri) {
  const result = await db.query(
    `SELECT status, COUNT(*) as count
     FROM attendance
     WHERE date_hijri >= $1 AND date_hijri <= $2
     GROUP BY status`,
    [fromDateHijri, toDateHijri]
  );
  const stats = {
    present: 0, late: 0, excused: 0, sick_leave: 0, absent: 0,
    official_leave: 0, official_mission: 0, total: 0
  };
  result.rows.forEach(row => {
    stats[row.status] = parseInt(row.count, 10);
    stats.total += parseInt(row.count, 10);
  });
  return stats;
}

export async function getTeachersRankedByAbsence(fromDateHijri, toDateHijri) {
  const result = await db.query(
    `SELECT
       t.id as teacher_id,
       t.name as teacher_name,
       t.specialty as teacher_specialty,
       COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absences,
       COUNT(CASE WHEN a.status = 'sick_leave' THEN 1 END) as sick_leaves,
       COUNT(CASE WHEN a.status = 'late' THEN 1 END) as lates,
       COUNT(CASE WHEN a.status = 'excused' THEN 1 END) as excused,
       COUNT(CASE WHEN a.status IN ('absent','sick_leave') THEN 1 END) as total_absences,
       COUNT(a.id) as total_records
     FROM teachers t
     LEFT JOIN attendance a
       ON a.teacher_id = t.id
       AND a.date_hijri >= $1
       AND a.date_hijri <= $2
     WHERE t.is_active = true
     GROUP BY t.id, t.name, t.specialty
     ORDER BY total_absences DESC, lates DESC, t.name ASC`,
    [fromDateHijri, toDateHijri]
  );
  return result.rows;
}

// ============================================================
//  ============ قسم الأيام الدراسية ============
// ============================================================

export async function setHoliday(dateHijri, dateGregorian, isHoliday, holidayName = null) {
  const result = await db.query(
    `INSERT INTO academic_days (date_hijri, date_gregorian, is_holiday, holiday_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (date_hijri)
     DO UPDATE SET
       is_holiday = EXCLUDED.is_holiday,
       holiday_name = EXCLUDED.holiday_name,
       date_gregorian = EXCLUDED.date_gregorian
     RETURNING *`,
    [dateHijri, dateGregorian, isHoliday, holidayName]
  );
  return result.rows[0];
}

export async function getDayStatus(dateHijri) {
  const result = await db.query(
    'SELECT * FROM academic_days WHERE date_hijri = $1',
    [dateHijri]
  );
  return result.rows[0] || null;
}

export async function getHolidays(fromDateHijri, toDateHijri) {
  const result = await db.query(
    `SELECT * FROM academic_days
     WHERE is_holiday = true
       AND date_hijri >= $1 AND date_hijri <= $2
     ORDER BY date_hijri ASC`,
    [fromDateHijri, toDateHijri]
  );
  return result.rows;
}

export async function removeHoliday(dateHijri) {
  await db.query('DELETE FROM academic_days WHERE date_hijri = $1', [dateHijri]);
}

export async function closeDB() {
  if (db) {
    await db.close();
    db = null;
    dbInitPromise = null;
  }
}