// search.js — بحث لحظي في أسماء المعلمات باستخدام MiniSearch
// مطابقة تامة: بدون fuzzy وبدون prefix. "نور" لا تجد "نورة".

import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/es/index.js';

let engine = null;

/** توحيد الحروف العربية: إزالة التشكيل والتطويل، وتوحيد الألف والياء */
function normalizeArabic(text) {
  return String(text || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')  // التشكيل
    .replace(/\u0640/g, '')                 // التطويل
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ → ا
    .replace(/\u0649/g, '\u064A')           // ى → ي
    .trim();
}

function processTerm(term) {
  const t = normalizeArabic(term).toLowerCase();
  return t.length ? t : null;
}

const OPTIONS = {
  fields: ['name', 'specialty', 'phone', 'email'],
  storeFields: ['id', 'name', 'specialty'],
  idField: 'id',
  processTerm,
  searchOptions: {
    fuzzy: false,
    prefix: false,
    combineWith: 'AND',
    processTerm
  }
};

function toDoc(teacher) {
  return {
    id: teacher.id,
    name: teacher.name || '',
    specialty: teacher.specialty || '',
    phone: teacher.phone || '',
    email: teacher.email || ''
  };
}

/** بناء الفهرس من الصفر */
export function initSearch(teachers = []) {
  engine = new MiniSearch(OPTIONS);
  engine.addAll(teachers.map(toDoc));
  return engine;
}

/** البحث — يُعيد مصفوفة معرّفات مرتبة حسب الصلة */
export function searchTeachers(query) {
  const clean = normalizeArabic(query);
  if (!engine || !clean) return [];
  return engine.search(clean).map(r => r.id);
}

export function addToIndex(teacher) {
  if (!engine || !teacher) return;
  try { engine.remove({ id: teacher.id }); } catch (e) { /* غير مفهرس بعد */ }
  engine.add(toDoc(teacher));
}

export function removeFromIndex(id) {
  if (!engine) return;
  try { engine.discard(id); } catch (e) { /* غير موجود */ }
}

export function reindexAll(teachers = []) {
  return initSearch(teachers);
}

export function indexSize() {
  return engine ? engine.documentCount : 0;
}
