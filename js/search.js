// ============================================================
//  search.js — محرك البحث اللحظي (MiniSearch)
//  يستخدم Inverted Index → بحث فوري حتى مع آلاف السجلات
// ============================================================

import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@6.3.0/dist/es/index.js';

// ============================================================
//  متغير عام يحمل نسخة MiniSearch
// ============================================================
let miniSearch = null;

// ============================================================
//  تهيئة محرك البحث مع قائمة المعلمات
//  - تُستدعى مرة واحدة عند بدء التطبيق
//  - أو بعد أي عملية استيراد جماعي
// ============================================================
export function initSearch(teachers = []) {
  miniSearch = new MiniSearch({
    // الحقول التي نبحث فيها
    fields: ['name', 'specialty', 'phone', 'email'],

    // الحقول التي نُرجعها في النتائج
    storeFields: ['id', 'name', 'specialty', 'phone', 'email', 'hire_date', 'notes'],

    // إعدادات البحث الافتراضية
    searchOptions: {
      boost: { name: 3, specialty: 2, phone: 1, email: 1 }, // الاسم أهم
      fuzzy: 0.2,   // يسمح بخطأ إملائي بسيط (مثلاً "نوره" تجد "نورة")
      prefix: true, // يسمح بالبحث بالبادئة (مثلاً "نو" تجد "نورة")
      combineWith: 'AND'
    },

    // تحسين عملية الفهرسة للغة العربية
    tokenize: (text) => text.split(/[\s,.\-()]+/).filter(Boolean),
    processTerm: (term) => term.toLowerCase().trim()
  });

  // إضافة كل المعلمات إلى الفهرس
  if (teachers.length > 0) {
    miniSearch.addAll(teachers);
  }

  console.log(`🔍 Search index ready (${teachers.length} records)`);
  return miniSearch;
}

// ============================================================
//  البحث
//  @param {string} query — نص البحث
//  @returns {Array} نتائج البحث مع بياناتها الكاملة
// ============================================================
export function searchTeachers(query) {
  if (!miniSearch) return [];
  if (!query || query.trim() === '') return [];

  const results = miniSearch.search(query.trim());

  // نحوّل النتائج إلى شكل موحد يحتوي على id والبيانات
  return results.map(r => ({
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    phone: r.phone,
    email: r.email,
    hire_date: r.hire_date,
    notes: r.notes,
    score: r.score // درجة التطابق (مفيدة للترتيب)
  }));
}

// ============================================================
//  إضافة معلمة واحدة إلى الفهرس (بعد الإضافة)
// ============================================================
export function addToIndex(teacher) {
  if (!miniSearch) return;
  try {
    miniSearch.add(teacher);
  } catch (err) {
    // إذا كانت المعلمة موجودة مسبقًا، نتجاهل الخطأ
    console.warn('addToIndex skipped:', err.message);
  }
}

// ============================================================
//  حذف معلمة من الفهرس (بعد الحذف)
// ============================================================
export function removeFromIndex(id) {
  if (!miniSearch) return;
  try {
    miniSearch.discard(id);
  } catch (err) {
    console.warn('removeFromIndex skipped:', err.message);
  }
}

// ============================================================
//  تحديث معلمة في الفهرس (حذف + إضافة)
// ============================================================
export function updateInIndex(teacher) {
  if (!miniSearch) return;
  removeFromIndex(teacher.id);
  addToIndex(teacher);
}

// ============================================================
//  إعادة بناء الفهرس كاملًا (بعد الاستيراد الجماعي)
// ============================================================
export function reindexAll(teachers = []) {
  if (!miniSearch) {
    return initSearch(teachers);
  }
  miniSearch.removeAll();
  if (teachers.length > 0) {
    miniSearch.addAll(teachers);
  }
  console.log(`🔍 Reindexed: ${teachers.length} records`);
}

// ============================================================
//  عدد السجلات في الفهرس
// ============================================================
export function indexSize() {
  return miniSearch ? miniSearch.documentCount : 0;
}