import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';

let db;

export async function initDB() {
  // حفظ قاعدة البيانات في IndexedDB (يعمل أوفلاين)
  db = new PGlite('idb://school-dashboard');
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT,
      phone TEXT,
      email TEXT,
      hire_date TEXT,
      notes TEXT
    );
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id),
      date TEXT,
      status TEXT
    );
  `);
  
  return db;
}

export async function addTeacher(teacher) {
  return db.query(
    'INSERT INTO teachers (name, specialty, phone, email, hire_date, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [teacher.name, teacher.specialty, teacher.phone, teacher.email, teacher.hire_date, teacher.notes]
  );
}

export async function getAllTeachers() {
  const result = await db.query('SELECT * FROM teachers ORDER BY name');
  return result.rows;
}

export async function updateTeacher(id, teacher) {
  return db.query(
    'UPDATE teachers SET name=$1, specialty=$2, phone=$3 WHERE id=$4',
    [teacher.name, teacher.specialty, teacher.phone, id]
  );
}

export async function deleteTeacher(id) {
  return db.query('DELETE FROM teachers WHERE id=$1', [id]);
}

export async function bulkInsertTeachers(teachers) {
  await db.transaction(async (tx) => {
    for (const t of teachers) {
      await tx.query(
        'INSERT INTO teachers (name, specialty, phone) VALUES ($1,$2,$3)',
        [t.name, t.specialty, t.phone]
      );
    }
  });
}