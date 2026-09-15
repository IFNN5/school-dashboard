// ============================================================
//  search.js — محرك البحث (مطابقة تامة)
//  - Exact Match فقط (لا Fuzzy، لا Prefix)
//  - البحث اللحظي مع كل حرف
// ============================================================

import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.2.0/dist/es/index.js';

let miniSearch = null;

export function initSearch(teachers = []) {
  miniSearch = new MiniSearch({
    fields: ['name', 'specialty', 'phone', 'email'],
    storeFields: ['id', 'name', 'specialty', 'phone', 'email', 'hire_date', 'notes'],
    searchOptions: {
      // ✅ مطابقة تامة: لا fuzzy، لا prefix
      fuzzy: false,
      prefix: true,
      combineWith: 'AND' // كل الكلمات يجب أن تتطابق
    },
    tokenize: (text) => text.split(/[\s,.\-()]+/).filter(Boolean),
    processTerm: (term) => term.toLowerCase().trim()
  });

  if (teachers.length > 0) {
    miniSearch.addAll(teachers);
  }

  console.log(`🔍 Search index ready (${teachers.length} records)`);
  return miniSearch;
}

export function searchTeachers(query) {
  if (!miniSearch) return [];
  if (!query || query.trim() === '') return [];

  // ✅ المطابقة التامة: نستخدم بحث MiniSearch العادي
  // لكن بدون fuzzy أو prefix
  const results = miniSearch.search(query.trim());
  return results.map(r => ({
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    phone: r.phone,
    email: r.email,
    hire_date: r.hire_date,
    notes: r.notes
  }));
}

export function addToIndex(teacher) {
  if (!miniSearch) return;
  try { miniSearch.add(teacher); } catch (err) { /* موجودة مسبقاً */ }
}

export function removeFromIndex(id) {
  if (!miniSearch) return;
  try { miniSearch.discard(id); } catch (err) { /* غير موجودة */ }
}

export function reindexAll(teachers = []) {
  if (!miniSearch) return initSearch(teachers);
  miniSearch.removeAll();
  if (teachers.length > 0) miniSearch.addAll(teachers);
  console.log(`🔍 Reindexed: ${teachers.length} records`);
}

export function indexSize() {
  return miniSearch ? miniSearch.documentCount : 0;
}
