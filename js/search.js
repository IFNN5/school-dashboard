import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@6.x/dist/es/index.js';

let miniSearch;

export function initSearch(teachers) {
  miniSearch = new MiniSearch({
    fields: ['name', 'specialty', 'phone'],
    storeFields: ['id', 'name', 'specialty', 'phone'],
    searchOptions: {
      boost: { name: 2 },
      fuzzy: 0.2,
      prefix: true
    }
  });
  miniSearch.addAll(teachers);
}

export function searchTeachers(query) {
  if (!query || query.length < 1) return [];
  return miniSearch.search(query);
}

export function addToIndex(teacher) {
  miniSearch.add(teacher);
}

export function removeFromIndex(id) {
  miniSearch.remove({ id });
}

export function reindexAll(teachers) {
  miniSearch.removeAll();
  miniSearch.addAll(teachers);
}