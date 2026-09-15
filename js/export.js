// ============================================================
//  export.js — تصدير البيانات (JSON + CSV)
//  - JSON: نسخة احتياطية كاملة يمكن استيرادها لاحقًا
//  - CSV: ملف يُفتح في Excel بسهولة
// ============================================================

// ============================================================
//  تصدير البيانات إلى ملف JSON
//  @param {Array} data — المصفوفة المراد تصديرها
//  @param {string} filename — اسم الملف بدون امتداد
// ============================================================
export function exportJSON(data, filename = 'backup') {
  if (!data || data.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const json = JSON.stringify(data, null, 2);
  downloadFile(
    json,
    `${filename}-${todayStr()}.json`,
    'application/json;charset=utf-8'
  );
}

// ============================================================
//  تصدير البيانات إلى ملف CSV
//  @param {Array} data — المصفوفة
//  @param {Array} columns — أسماء الأعمدة (مفاتيح الكائنات)
//  @param {string} filename — اسم الملف بدون امتداد
// ============================================================
export function exportCSV(data, columns, filename = 'backup') {
  if (!data || data.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const cols = columns && columns.length ? columns : Object.keys(data[0]);

  // سطر الرأس
  const header = cols.map(c => escapeCSV(headerLabel(c))).join(',');

  // الصفوف
  const rows = data.map(row =>
    cols.map(c => escapeCSV(row[c])).join(',')
  );

  // \uFEFF = BOM لدعم العربية في Excel
  const csv = '\uFEFF' + [header, ...rows].join('\n');

  downloadFile(
    csv,
    `${filename}-${todayStr()}.csv`,
    'text/csv;charset=utf-8'
  );
}

// ============================================================
//  قراءة ملف JSON مُستورد (نسخة احتياطية)
//  @returns {Promise<Array>}
// ============================================================
export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('لم يتم اختيار ملف'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const arr = Array.isArray(data) ? data : [data];

        // تصفية السجلات غير الصالحة
        const cleaned = arr.filter(item =>
          item && typeof item === 'object' && item.name
        );

        if (cleaned.length === 0) {
          reject(new Error('الملف لا يحتوي على سجلات صالحة'));
          return;
        }

        resolve(cleaned);
      } catch (err) {
        reject(new Error('ملف JSON غير صالح: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsText(file, 'UTF-8');
  });
}

// ============================================================
//  تنزيل نص كملف
// ============================================================
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // تحرير الذاكرة
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ============================================================
//  تهريب القيم التي تحتوي على فواصل أو علامات تنصيص
// ============================================================
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================
//  ترجمة أسماء الأعمدة إلى العربية (لأجل CSV فقط)
//  إذا لم يوجد ترجمة، نستخدم المفتاح كما هو
// ============================================================
function headerLabel(key) {
  const labels = {
    id: 'الرقم',
    name: 'الاسم',
    specialty: 'التخصص',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني',
    hire_date: 'تاريخ التعيين',
    notes: 'ملاحظات',
    created_at: 'تاريخ الإنشاء',
    date: 'التاريخ',
    status: 'الحالة',
    note: 'ملاحظة'
  };
  return labels[key] || key;
}

// ============================================================
//  تاريخ اليوم بصيغة YYYY-MM-DD
// ============================================================
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}