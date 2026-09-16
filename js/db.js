// db.js — قاعدة البيانات المحلية (PGlite / PostgreSQL WASM) مخزّنة في IndexedDB
// لا سيرفر، لا API. كل الاستعلامات تعمل داخل المتصفح.

import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/index.js';

let db = null;
let dbInitPromise = null;   // قفل يمنع التهيئة المتوازية

/* ------------------------------------------------------------------ */
/* السكيما                                                             */
/* ------------------------------------------------------------------ */

const SCHEMA = {
  teachers: {
    columns: ['id', 'name', 'specialty', 'phone', 'email', 'hire_date', 'notes', 'is_active', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT,
      phone TEXT,
      email TEXT,
      hire_date TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  },
  attendance: {
    columns: ['id', 'teacher_id', 'date_hijri', 'date_gregorian', 'status', 'time', 'note', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS attendance (
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
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date_hijri);
    CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);`
  },
  academic_days: {
    columns: ['id', 'date_hijri', 'date_gregorian', 'is_holiday', 'holiday_name', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS academic_days (
      id SERIAL PRIMARY KEY,
      date_hijri TEXT UNIQUE NOT NULL,
      date_gregorian TEXT NOT NULL,
      is_holiday BOOLEAN DEFAULT false,
      holiday_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  },
  classes: {
    columns: ['id', 'name', 'grade_level', 'section', 'capacity', 'notes', 'is_active', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      grade_level INTEGER,
      section TEXT,
      capacity INTEGER,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  },
  subjects: {
    columns: ['id', 'name', 'code', 'weekly_hours', 'color', 'is_active', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      weekly_hours INTEGER DEFAULT 0,
      color TEXT DEFAULT '#2563eb',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  },
  periods: {
    columns: ['id', 'name', 'start_time', 'end_time', 'order_index', 'is_break', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS periods (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      is_break BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  },
  teacher_assignments: {
    columns: ['id', 'teacher_id', 'subject_id', 'class_id', 'weekly_hours', 'notes', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS teacher_assignments (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      weekly_hours INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacher_id, subject_id, class_id)
    );`
  },
  schedule: {
    columns: ['id', 'class_id', 'day_of_week', 'period_id', 'subject_id', 'teacher_id', 'room', 'notes', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS schedule (
      id SERIAL PRIMARY KEY,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      period_id INTEGER REFERENCES periods(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      room TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(class_id, day_of_week, period_id)
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_teacher ON schedule(teacher_id);`
  },
  visits: {
    columns: ['id', 'teacher_id', 'date_hijri', 'date_gregorian', 'period_id', 'class_id',
      'visit_type', 'score', 'strengths', 'improvements', 'recommendations', 'notes', 'created_at'],
    sql: `CREATE TABLE IF NOT EXISTS visits (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      date_hijri TEXT NOT NULL,
      date_gregorian TEXT NOT NULL,
      period_id INTEGER REFERENCES periods(id),
      class_id INTEGER REFERENCES classes(id),
      visit_type TEXT,
      score INTEGER,
      strengths TEXT,
      improvements TEXT,
      recommendations TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  }
};

// ترتيب الإنشاء يحترم الاعتماديات
const TABLE_ORDER = [
  'teachers', 'classes', 'subjects', 'periods',
  'attendance', 'academic_days', 'teacher_assignments', 'schedule', 'visits'
];

/* ------------------------------------------------------------------ */
/* التهيئة والترحيل                                                    */
/* ------------------------------------------------------------------ */

/**
 * ترحيل السكيما: PGlite يحفظ الجداول في IndexedDB، و CREATE TABLE IF NOT EXISTS
 * لا يضيف أعمدة جديدة لجدول قديم. لذلك نفحص كل عمود، وإذا فشل الفحص نُسقط الجدول.
 */
async function migrateSchema(pg) {
  const broken = [];

  for (const table of TABLE_ORDER) {
    const def = SCHEMA[table];
    try {
      const cols = def.columns.map(c => `"${c}"`).join(', ');
      await pg.query(`SELECT ${cols} FROM ${table} LIMIT 0`);
    } catch (err) {
      const msg = String(err && err.message || err);
      // الجدول غير موجود أصلاً — لا حاجة لإسقاطه
      if (!/does not exist/i.test(msg) || /column/i.test(msg)) {
        broken.push(table);
      } else if (/relation .* does not exist/i.test(msg)) {
        // سيُنشأ لاحقاً
      } else {
        broken.push(table);
      }
    }
  }

  // الإسقاط بترتيب عكسي حتى لا تتعارض المفاتيح الأجنبية
  for (const table of [...TABLE_ORDER].reverse()) {
    if (broken.includes(table)) {
      console.warn(`[db] ترحيل: إسقاط الجدول ${table} لاختلاف السكيما`);
      await pg.exec(`DROP TABLE IF EXISTS ${table} CASCADE;`);
    }
  }

  return broken;
}

async function createTables(pg) {
  for (const table of TABLE_ORDER) {
    await pg.exec(SCHEMA[table].sql);
  }
}

/** بيانات ابتدائية: حصص افتراضية إن لم توجد */
async function seedDefaults(pg) {
  const { rows } = await pg.query('SELECT COUNT(*)::int AS c FROM periods');
  if (rows[0].c > 0) return;

  const defaults = [
    ['الحصة الأولى', '07:00', '07:45', 1, false],
    ['الحصة الثانية', '07:45', '08:30', 2, false],
    ['الحصة الثالثة', '08:30', '09:15', 3, false],
    ['الفسحة', '09:15', '09:40', 4, true],
    ['الحصة الرابعة', '09:40', '10:25', 5, false],
    ['الحصة الخامسة', '10:25', '11:10', 6, false],
    ['الحصة السادسة', '11:10', '11:55', 7, false],
    ['الحصة السابعة', '11:55', '12:40', 8, false]
  ];
  for (const p of defaults) {
    await pg.query(
      'INSERT INTO periods (name, start_time, end_time, order_index, is_break) VALUES ($1,$2,$3,$4,$5)',
      p
    );
  }
}

/** تهيئة قاعدة البيانات — آمنة عند الاستدعاء المتوازي */
export function initDB() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    const pg = new PGlite('idb://school-dashboard');
    await pg.waitReady;
    await migrateSchema(pg);
    await createTables(pg);
    await seedDefaults(pg);
    db = pg;
    return pg;
  })();

  return dbInitPromise;
}

async function getDB() {
  if (db) return db;
  return initDB();
}

async function q(sql, params = []) {
  const pg = await getDB();
  const res = await pg.query(sql, params);
  return res.rows || [];
}

async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

/* ------------------------------------------------------------------ */
/* المعلمات                                                            */
/* ------------------------------------------------------------------ */

export async function getAllTeachers(includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  return q(`SELECT * FROM teachers ${where} ORDER BY name ASC`);
}

export async function getTeacher(id) {
  return one('SELECT * FROM teachers WHERE id = $1', [id]);
}

export async function addTeacher(t) {
  return one(
    `INSERT INTO teachers (name, specialty, phone, email, hire_date, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [t.name, t.specialty || null, t.phone || null, t.email || null,
     t.hire_date || null, t.notes || null, t.is_active !== false]
  );
}

export async function updateTeacher(id, t) {
  return one(
    `UPDATE teachers SET name=$2, specialty=$3, phone=$4, email=$5,
     hire_date=$6, notes=$7, is_active=$8 WHERE id=$1 RETURNING *`,
    [id, t.name, t.specialty || null, t.phone || null, t.email || null,
     t.hire_date || null, t.notes || null, t.is_active !== false]
  );
}

export async function deleteTeacher(id) {
  await q('DELETE FROM teachers WHERE id = $1', [id]);
  return true;
}

export async function toggleTeacherActive(id, isActive) {
  return one('UPDATE teachers SET is_active = $2 WHERE id = $1 RETURNING *', [id, !!isActive]);
}

/** إدراج جماعي داخل معاملة واحدة مع تحديث المتطابق بالاسم */
export async function bulkInsertTeachers(teachers) {
  const pg = await getDB();
  let inserted = 0, updated = 0, skipped = 0;

  await pg.exec('BEGIN;');
  try {
    for (const t of teachers) {
      const name = (t.name || '').trim();
      if (!name) { skipped++; continue; }

      const existing = await pg.query('SELECT id FROM teachers WHERE name = $1 LIMIT 1', [name]);
      if (existing.rows.length) {
        await pg.query(
          `UPDATE teachers SET
             specialty = COALESCE(NULLIF($2,''), specialty),
             phone     = COALESCE(NULLIF($3,''), phone),
             email     = COALESCE(NULLIF($4,''), email),
             hire_date = COALESCE(NULLIF($5,''), hire_date),
             notes     = COALESCE(NULLIF($6,''), notes)
           WHERE id = $1`,
          [existing.rows[0].id, t.specialty || '', t.phone || '', t.email || '',
           t.hire_date || '', t.notes || '']
        );
        updated++;
      } else {
        await pg.query(
          `INSERT INTO teachers (name, specialty, phone, email, hire_date, notes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [name, t.specialty || null, t.phone || null, t.email || null,
           t.hire_date || null, t.notes || null]
        );
        inserted++;
      }
    }
    await pg.exec('COMMIT;');
  } catch (err) {
    await pg.exec('ROLLBACK;');
    throw err;
  }

  return { inserted, updated, skipped };
}

export async function countTeachers(onlyActive = true) {
  const where = onlyActive ? 'WHERE is_active = true' : '';
  const row = await one(`SELECT COUNT(*)::int AS c FROM teachers ${where}`);
  return row ? row.c : 0;
}

/* ------------------------------------------------------------------ */
/* الحضور                                                              */
/* ------------------------------------------------------------------ */

export async function getAttendanceByDate(dateHijri) {
  return q('SELECT * FROM attendance WHERE date_hijri = $1', [dateHijri]);
}

/** حفظ جماعي: UPSERT على (teacher_id, date_hijri) */
export async function saveAttendanceBulk(records) {
  const pg = await getDB();
  await pg.exec('BEGIN;');
  try {
    for (const r of records) {
      await pg.query(
        `INSERT INTO attendance (teacher_id, date_hijri, date_gregorian, status, time, note)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (teacher_id, date_hijri)
         DO UPDATE SET status = EXCLUDED.status,
                       time = EXCLUDED.time,
                       note = EXCLUDED.note,
                       date_gregorian = EXCLUDED.date_gregorian`,
        [r.teacher_id, r.date_hijri, r.date_gregorian, r.status, r.time || null, r.note || null]
      );
    }
    await pg.exec('COMMIT;');
  } catch (err) {
    await pg.exec('ROLLBACK;');
    throw err;
  }
  return records.length;
}

export async function deleteAttendance(teacherId, dateHijri) {
  await q('DELETE FROM attendance WHERE teacher_id = $1 AND date_hijri = $2', [teacherId, dateHijri]);
  return true;
}

export async function deleteAttendanceByDate(dateHijri) {
  await q('DELETE FROM attendance WHERE date_hijri = $1', [dateHijri]);
  return true;
}

/** سجل الحضور مع فلاتر: {from, to, teacherId, status, limit} */
export async function getAttendanceHistory(filters = {}) {
  const where = [];
  const params = [];

  if (filters.from) { params.push(filters.from); where.push(`a.date_hijri >= $${params.length}`); }
  if (filters.to) { params.push(filters.to); where.push(`a.date_hijri <= $${params.length}`); }
  if (filters.teacherId) { params.push(filters.teacherId); where.push(`a.teacher_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); where.push(`a.status = $${params.length}`); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(parseInt(filters.limit, 10) || 1000, 5000);

  return q(
    `SELECT a.*, t.name AS teacher_name, t.specialty
     FROM attendance a
     JOIN teachers t ON t.id = a.teacher_id
     ${clause}
     ORDER BY a.date_hijri DESC, t.name ASC
     LIMIT ${limit}`,
    params
  );
}

/** إحصائيات معلمة خلال فترة */
export async function getTeacherStats(teacherId, from, to) {
  const rows = await q(
    `SELECT status, COUNT(*)::int AS count
     FROM attendance
     WHERE teacher_id = $1 AND date_hijri >= $2 AND date_hijri <= $3
     GROUP BY status`,
    [teacherId, from, to]
  );

  const byStatus = {};
  let total = 0;
  for (const r of rows) { byStatus[r.status] = r.count; total += r.count; }

  const records = await q(
    `SELECT * FROM attendance
     WHERE teacher_id = $1 AND date_hijri >= $2 AND date_hijri <= $3
     ORDER BY date_hijri DESC`,
    [teacherId, from, to]
  );

  return { teacherId, from, to, total, byStatus, records };
}

/** إحصائيات عامة خلال فترة */
export async function getGeneralStats(from, to) {
  const byStatusRows = await q(
    `SELECT status, COUNT(*)::int AS count
     FROM attendance WHERE date_hijri >= $1 AND date_hijri <= $2
     GROUP BY status`,
    [from, to]
  );
  const byStatus = {};
  let total = 0;
  for (const r of byStatusRows) { byStatus[r.status] = r.count; total += r.count; }

  const daysRow = await one(
    `SELECT COUNT(DISTINCT date_hijri)::int AS c FROM attendance
     WHERE date_hijri >= $1 AND date_hijri <= $2`,
    [from, to]
  );
  const teachersRow = await one('SELECT COUNT(*)::int AS c FROM teachers WHERE is_active = true');

  return {
    from, to, total, byStatus,
    daysRecorded: daysRow ? daysRow.c : 0,
    activeTeachers: teachersRow ? teachersRow.c : 0
  };
}

/** ترتيب المعلمات بالأكثر غياباً */
export async function getTeachersRankedByAbsence(from, to) {
  return q(
    `SELECT t.id, t.name, t.specialty,
       COUNT(a.id) FILTER (WHERE a.status = 'absent')::int         AS absent,
       COUNT(a.id) FILTER (WHERE a.status = 'sick_leave')::int     AS sick_leave,
       COUNT(a.id) FILTER (WHERE a.status = 'late')::int           AS late,
       COUNT(a.id) FILTER (WHERE a.status = 'excused')::int        AS excused,
       COUNT(a.id) FILTER (WHERE a.status = 'present')::int        AS present,
       COUNT(a.id) FILTER (WHERE a.status = 'official_leave')::int AS official_leave,
       COUNT(a.id) FILTER (WHERE a.status = 'official_mission')::int AS official_mission,
       COUNT(a.id)::int AS total
     FROM teachers t
     LEFT JOIN attendance a
       ON a.teacher_id = t.id AND a.date_hijri >= $1 AND a.date_hijri <= $2
     WHERE t.is_active = true
     GROUP BY t.id, t.name, t.specialty
     ORDER BY (COUNT(a.id) FILTER (WHERE a.status IN ('absent','sick_leave'))) DESC, t.name ASC`,
    [from, to]
  );
}

/* ------------------------------------------------------------------ */
/* الأيام الدراسية والإجازات                                           */
/* ------------------------------------------------------------------ */

export async function setHoliday(dateHijri, dateGregorian, isHoliday, name) {
  return one(
    `INSERT INTO academic_days (date_hijri, date_gregorian, is_holiday, holiday_name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (date_hijri)
     DO UPDATE SET is_holiday = EXCLUDED.is_holiday,
                   holiday_name = EXCLUDED.holiday_name,
                   date_gregorian = EXCLUDED.date_gregorian
     RETURNING *`,
    [dateHijri, dateGregorian, !!isHoliday, name || null]
  );
}

export async function getDayStatus(dateHijri) {
  return one('SELECT * FROM academic_days WHERE date_hijri = $1', [dateHijri]);
}

export async function getHolidays(from, to) {
  return q(
    `SELECT * FROM academic_days
     WHERE is_holiday = true AND date_hijri >= $1 AND date_hijri <= $2
     ORDER BY date_hijri ASC`,
    [from, to]
  );
}

export async function removeHoliday(dateHijri) {
  await q('DELETE FROM academic_days WHERE date_hijri = $1', [dateHijri]);
  return true;
}

/* ------------------------------------------------------------------ */
/* الصفوف                                                              */
/* ------------------------------------------------------------------ */

export async function getAllClasses(includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  return q(`SELECT * FROM classes ${where} ORDER BY grade_level NULLS LAST, name ASC`);
}

export async function addClass(c) {
  return one(
    `INSERT INTO classes (name, grade_level, section, capacity, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [c.name, numOrNull(c.grade_level), c.section || null, numOrNull(c.capacity),
     c.notes || null, c.is_active !== false]
  );
}

export async function updateClass(id, c) {
  return one(
    `UPDATE classes SET name=$2, grade_level=$3, section=$4, capacity=$5, notes=$6, is_active=$7
     WHERE id=$1 RETURNING *`,
    [id, c.name, numOrNull(c.grade_level), c.section || null, numOrNull(c.capacity),
     c.notes || null, c.is_active !== false]
  );
}

export async function deleteClass(id) {
  await q('DELETE FROM classes WHERE id = $1', [id]);
  return true;
}

/* ------------------------------------------------------------------ */
/* المواد                                                              */
/* ------------------------------------------------------------------ */

export async function getAllSubjects(includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  return q(`SELECT * FROM subjects ${where} ORDER BY name ASC`);
}

export async function addSubject(s) {
  return one(
    `INSERT INTO subjects (name, code, weekly_hours, color, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [s.name, s.code || null, numOrNull(s.weekly_hours) || 0, s.color || '#2563eb', s.is_active !== false]
  );
}

export async function updateSubject(id, s) {
  return one(
    `UPDATE subjects SET name=$2, code=$3, weekly_hours=$4, color=$5, is_active=$6
     WHERE id=$1 RETURNING *`,
    [id, s.name, s.code || null, numOrNull(s.weekly_hours) || 0, s.color || '#2563eb', s.is_active !== false]
  );
}

export async function deleteSubject(id) {
  await q('DELETE FROM subjects WHERE id = $1', [id]);
  return true;
}

/* ------------------------------------------------------------------ */
/* الحصص                                                               */
/* ------------------------------------------------------------------ */

export async function getAllPeriods() {
  return q('SELECT * FROM periods ORDER BY order_index ASC');
}

export async function addPeriod(p) {
  return one(
    `INSERT INTO periods (name, start_time, end_time, order_index, is_break)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [p.name, p.start_time, p.end_time, numOrNull(p.order_index) || 0, !!p.is_break]
  );
}

export async function updatePeriod(id, p) {
  return one(
    `UPDATE periods SET name=$2, start_time=$3, end_time=$4, order_index=$5, is_break=$6
     WHERE id=$1 RETURNING *`,
    [id, p.name, p.start_time, p.end_time, numOrNull(p.order_index) || 0, !!p.is_break]
  );
}

export async function deletePeriod(id) {
  await q('DELETE FROM periods WHERE id = $1', [id]);
  return true;
}

/* ------------------------------------------------------------------ */
/* التكليفات                                                           */
/* ------------------------------------------------------------------ */

export async function getAllAssignments(filters = {}) {
  const where = [];
  const params = [];
  if (filters.teacherId) { params.push(filters.teacherId); where.push(`a.teacher_id = $${params.length}`); }
  if (filters.classId) { params.push(filters.classId); where.push(`a.class_id = $${params.length}`); }
  if (filters.subjectId) { params.push(filters.subjectId); where.push(`a.subject_id = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return q(
    `SELECT a.*, t.name AS teacher_name, s.name AS subject_name, c.name AS class_name
     FROM teacher_assignments a
     LEFT JOIN teachers t ON t.id = a.teacher_id
     LEFT JOIN subjects s ON s.id = a.subject_id
     LEFT JOIN classes  c ON c.id = a.class_id
     ${clause}
     ORDER BY t.name ASC, c.name ASC`,
    params
  );
}

export async function addAssignment(a) {
  return one(
    `INSERT INTO teacher_assignments (teacher_id, subject_id, class_id, weekly_hours, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (teacher_id, subject_id, class_id)
     DO UPDATE SET weekly_hours = EXCLUDED.weekly_hours, notes = EXCLUDED.notes
     RETURNING *`,
    [a.teacher_id, a.subject_id, a.class_id, numOrNull(a.weekly_hours), a.notes || null]
  );
}

export async function updateAssignment(id, a) {
  return one(
    `UPDATE teacher_assignments SET teacher_id=$2, subject_id=$3, class_id=$4, weekly_hours=$5, notes=$6
     WHERE id=$1 RETURNING *`,
    [id, a.teacher_id, a.subject_id, a.class_id, numOrNull(a.weekly_hours), a.notes || null]
  );
}

export async function deleteAssignment(id) {
  await q('DELETE FROM teacher_assignments WHERE id = $1', [id]);
  return true;
}

/* ------------------------------------------------------------------ */
/* الجدول الدراسي                                                      */
/* ------------------------------------------------------------------ */

export async function getScheduleForClass(classId) {
  return q(
    `SELECT sc.*, s.name AS subject_name, s.color AS subject_color,
            t.name AS teacher_name, p.name AS period_name, p.order_index, p.is_break
     FROM schedule sc
     LEFT JOIN subjects s ON s.id = sc.subject_id
     LEFT JOIN teachers t ON t.id = sc.teacher_id
     LEFT JOIN periods  p ON p.id = sc.period_id
     WHERE sc.class_id = $1
     ORDER BY sc.day_of_week ASC, p.order_index ASC`,
    [classId]
  );
}

export async function getScheduleForTeacher(teacherId) {
  return q(
    `SELECT sc.*, s.name AS subject_name, s.color AS subject_color,
            c.name AS class_name, p.name AS period_name, p.order_index, p.is_break
     FROM schedule sc
     LEFT JOIN subjects s ON s.id = sc.subject_id
     LEFT JOIN classes  c ON c.id = sc.class_id
     LEFT JOIN periods  p ON p.id = sc.period_id
     WHERE sc.teacher_id = $1
     ORDER BY sc.day_of_week ASC, p.order_index ASC`,
    [teacherId]
  );
}

export async function setScheduleCell(classId, day, periodId, data) {
  return one(
    `INSERT INTO schedule (class_id, day_of_week, period_id, subject_id, teacher_id, room, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (class_id, day_of_week, period_id)
     DO UPDATE SET subject_id = EXCLUDED.subject_id,
                   teacher_id = EXCLUDED.teacher_id,
                   room = EXCLUDED.room,
                   notes = EXCLUDED.notes
     RETURNING *`,
    [classId, day, periodId, data.subject_id || null, data.teacher_id || null,
     data.room || null, data.notes || null]
  );
}

export async function deleteScheduleCell(classId, day, periodId) {
  await q(
    'DELETE FROM schedule WHERE class_id = $1 AND day_of_week = $2 AND period_id = $3',
    [classId, day, periodId]
  );
  return true;
}

/** هل المعلمة مشغولة في هذا اليوم/الحصة لدى صف آخر؟ */
export async function checkConflict(teacherId, day, periodId, excludeClassId) {
  if (!teacherId) return null;
  return one(
    `SELECT sc.*, c.name AS class_name
     FROM schedule sc
     LEFT JOIN classes c ON c.id = sc.class_id
     WHERE sc.teacher_id = $1 AND sc.day_of_week = $2 AND sc.period_id = $3
       AND sc.class_id <> $4
     LIMIT 1`,
    [teacherId, day, periodId, excludeClassId || -1]
  );
}

/* ------------------------------------------------------------------ */
/* الزيارات الصفية                                                     */
/* ------------------------------------------------------------------ */

export async function getAllVisits(filters = {}) {
  const where = [];
  const params = [];
  if (filters.teacherId) { params.push(filters.teacherId); where.push(`v.teacher_id = $${params.length}`); }
  if (filters.from) { params.push(filters.from); where.push(`v.date_hijri >= $${params.length}`); }
  if (filters.to) { params.push(filters.to); where.push(`v.date_hijri <= $${params.length}`); }
  if (filters.visitType) { params.push(filters.visitType); where.push(`v.visit_type = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return q(
    `SELECT v.*, t.name AS teacher_name, t.specialty,
            c.name AS class_name, p.name AS period_name
     FROM visits v
     LEFT JOIN teachers t ON t.id = v.teacher_id
     LEFT JOIN classes  c ON c.id = v.class_id
     LEFT JOIN periods  p ON p.id = v.period_id
     ${clause}
     ORDER BY v.date_hijri DESC, v.id DESC
     LIMIT 1000`,
    params
  );
}

export async function getVisit(id) {
  return one('SELECT * FROM visits WHERE id = $1', [id]);
}

export async function addVisit(v) {
  return one(
    `INSERT INTO visits (teacher_id, date_hijri, date_gregorian, period_id, class_id,
       visit_type, score, strengths, improvements, recommendations, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [v.teacher_id, v.date_hijri, v.date_gregorian, numOrNull(v.period_id), numOrNull(v.class_id),
     v.visit_type || null, numOrNull(v.score), v.strengths || null, v.improvements || null,
     v.recommendations || null, v.notes || null]
  );
}

export async function updateVisit(id, v) {
  return one(
    `UPDATE visits SET teacher_id=$2, date_hijri=$3, date_gregorian=$4, period_id=$5,
       class_id=$6, visit_type=$7, score=$8, strengths=$9, improvements=$10,
       recommendations=$11, notes=$12
     WHERE id=$1 RETURNING *`,
    [id, v.teacher_id, v.date_hijri, v.date_gregorian, numOrNull(v.period_id), numOrNull(v.class_id),
     v.visit_type || null, numOrNull(v.score), v.strengths || null, v.improvements || null,
     v.recommendations || null, v.notes || null]
  );
}

export async function deleteVisit(id) {
  await q('DELETE FROM visits WHERE id = $1', [id]);
  return true;
}

/* ------------------------------------------------------------------ */
/* النسخ الاحتياطي الكامل                                              */
/* ------------------------------------------------------------------ */

export async function exportAllData() {
  const out = { version: 1, exported_at: new Date().toISOString(), tables: {} };
  for (const table of TABLE_ORDER) {
    out.tables[table] = await q(`SELECT * FROM ${table} ORDER BY id ASC`);
  }
  return out;
}

/** استعادة نسخة احتياطية — تمسح كل البيانات الحالية */
export async function importAllData(payload) {
  const pg = await getDB();
  const tables = (payload && payload.tables) || {};

  await pg.exec('BEGIN;');
  try {
    for (const table of [...TABLE_ORDER].reverse()) {
      await pg.query(`DELETE FROM ${table}`);
    }

    for (const table of TABLE_ORDER) {
      const rows = tables[table];
      if (!Array.isArray(rows) || !rows.length) continue;
      const cols = SCHEMA[table].columns;

      for (const row of rows) {
        const used = cols.filter(c => row[c] !== undefined);
        const placeholders = used.map((_, i) => `$${i + 1}`).join(',');
        await pg.query(
          `INSERT INTO ${table} (${used.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`,
          used.map(c => row[c])
        );
      }

      // إعادة ضبط تسلسل المعرّفات
      await pg.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`
      );
    }

    await pg.exec('COMMIT;');
  } catch (err) {
    await pg.exec('ROLLBACK;');
    throw err;
  }

  return true;
}

/* ------------------------------------------------------------------ */

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
