// ============================================================
//  db.js — طبقة قاعدة البيانات (PGlite)
//  تعمل بالكامل داخل المتصفح، وتخزّن البيانات في IndexedDB
// ============================================================

import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';

// ============================================================
//  متغير عام يحمل نسخة قاعدة البيانات
// ============================================================
let db = null;

// ============================================================
//  تهيئة قاعدة البيانات
//  - تنشئ الجداول إن لم تكن موجودة
//  - تخزّن البيانات في IndexedDB (idb://)
//  - تُستدعى مرة واحدة عند بدء التطبيق
// ============================================================
export async function initDB() {
  if (db) return db; // إذا كانت مهيأة مسبقًا، أرجعها

  // idb://school-dashboard يعني: خزّن قاعدة البيانات في IndexedDB
  // باسم "school-dashboard" — يبقى محفوظًا بعد إغلاق المتصفح
  db = new PGlite('idb://school-dashboard');

  // انتظر حتى تنتهي PGlite من تهيئة نفسها
  await db.waitReady;

  // --------------------------------------------------------
  //  جدول المعلمات
  // --------------------------------------------------------
  await db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT,
      phone TEXT,
      email TEXT,
      hire_date TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // --------------------------------------------------------
  //  جدول الحضور (جاهز للمرحلة القادمة)
  // --------------------------------------------------------
  await db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ Database ready');
  return db;
}

// ============================================================
//  جلب كل المعلمات مرتبةً بالاسم
// ============================================================
export async function getAllTeachers() {
  const result = await db.query(
    'SELECT * FROM teachers ORDER BY name ASC'
  );
  return result.rows;
}

// ============================================================
//  إضافة معلمة جديدة
//  @returns {Object} السجل الجديد بعد الإضافة
// ============================================================
export async function addTeacher(teacher) {
  const result = await db.query(
    `INSERT INTO teachers (name, specialty, phone, email, hire_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      teacher.name,
      teacher.specialty || null,
      teacher.phone || null,
      teacher.email || null,
      teacher.hire_date || null,
      teacher.notes || null
    ]
  );
  return result.rows[0];
}

// ============================================================
//  تحديث بيانات معلمة
// ============================================================
export async function updateTeacher(id, teacher) {
  const result = await db.query(
    `UPDATE teachers
     SET name = $1,
         specialty = $2,
         phone = $3,
         email = $4,
         hire_date = $5,
         notes = $6
     WHERE id = $7
     RETURNING *`,
    [
      teacher.name,
      teacher.specialty || null,
      teacher.phone || null,
      teacher.email || null,
      teacher.hire_date || null,
      teacher.notes || null,
      id
    ]
  );
  return result.rows[0];
}

// ============================================================
//  حذف معلمة
// ============================================================
export async function deleteTeacher(id) {
  await db.query('DELETE FROM teachers WHERE id = $1', [id]);
}

// ============================================================
//  إدخال مجموعة معلمات دفعة واحدة (استيراد جماعي)
//  نستخدم transaction لضمان:
//  - إذا فشل أي سجل، لا يُحفظ أي شيء (Atomicity)
//  - سرعة عالية جدًا عند الإدخال الجماعي
// ============================================================
export async function bulkInsertTeachers(teachers) {
  if (!teachers || teachers.length === 0) return 0;

  let inserted = 0;

  await db.transaction(async (tx) => {
    for (const t of teachers) {
      // تجاهل السجل إن لم يحتوي على اسم
      if (!t.name || t.name.trim() === '') continue;

      await tx.query(
        `INSERT INTO teachers (name, specialty, phone, email, hire_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          t.name.trim(),
          t.specialty || null,
          t.phone || null,
          t.email || null,
          t.hire_date || null,
          t.notes || null
        ]
      );
      inserted++;
    }
  });

  return inserted;
}

// ============================================================
//  عدد المعلمات الكلي
// ============================================================
export async function countTeachers() {
  const result = await db.query('SELECT COUNT(*) as total FROM teachers');
  return parseInt(result.rows[0].total, 10);
}

// ============================================================
//  حذف كل البيانات (استخدام بحذر — من الإعدادات)
// ============================================================
export async function deleteAllTeachers() {
  await db.query('DELETE FROM teachers');
}

// ============================================================
//  إغلاق قاعدة البيانات (اختياري — عند إغلاق التطبيق)
// ============================================================
export async function closeDB() {
  if (db) {
    await db.close();
    db = null;
  }
}