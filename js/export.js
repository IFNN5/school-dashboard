// export.js — تصدير البيانات إلى JSON و CSV (مع BOM حتى تظهر العربية في Excel)

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** تصدير أي بيانات كملف JSON */
export function exportJSON(data, filename = 'export.json') {
  download(JSON.stringify(data, null, 2), filename, 'application/json;charset=utf-8');
}

function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * تصدير CSV.
 * columns: [{ key: 'name', label: 'الاسم' }, ...]
 */
export function exportCSV(data, columns, filename = 'export.csv') {
  const cols = columns.map(c => (typeof c === 'string' ? { key: c, label: c } : c));
  const lines = [cols.map(c => escapeCell(c.label)).join(',')];

  for (const row of data) {
    lines.push(cols.map(c => escapeCell(
      typeof c.value === 'function' ? c.value(row) : row[c.key]
    )).join(','));
  }

  download('\uFEFF' + lines.join('\r\n'), filename, 'text/csv;charset=utf-8');
}

/** قراءة ملف JSON مرفوع — يُعيد Promise */
export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('لم يُختر أي ملف')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '').replace(/^\uFEFF/, '')));
      } catch (e) {
        reject(new Error('ملف JSON غير صالح: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    reader.readAsText(file, 'utf-8');
  });
}
