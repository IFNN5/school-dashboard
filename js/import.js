// ============================================================
//  import.js — استيراد البيانات من ملفات CSV و JSON
//  يحوّل الملف إلى مصفوفة كائنات جاهزة للإدخال
// ============================================================

// ============================================================
//  الأعمدة المدعومة في ملف CSV
//  ملاحظة: "name" إلزامي، والباقي اختياري
// ============================================================
const COLUMN_ALIASES = {
  // الاسم
  name: ['name', 'الاسم', 'اسم', 'الاسم الكامل', 'full_name', 'fullname'],
  // التخصص
  specialty: ['specialty', 'التخصص', 'تخصص', 'المادة', 'subject', 'major'],
  // الهاتف
  phone: ['phone', 'الهاتف', 'الجوال', 'رقم الهاتف', 'رقم الجوال', 'mobile', 'tel'],
  // البريد
  email: ['email', 'البريد', 'البريد الإلكتروني', 'الايميل', 'mail'],
  // تاريخ التعيين
  hire_date: ['hire_date', 'تاريخ التعيين', 'تاريخ المباشرة', 'تاريخ الالتحاق', 'date'],
  // ملاحظات
  notes: ['notes', 'ملاحظات', 'ملاحظة', 'الملاحظات']
};

// ============================================================
//  تطبيع اسم العمود
//  يزيل المسافات ويحوله لأحرف صغيرة للمقارنة
// ============================================================
function normalizeHeader(header) {
  return String(header || '')
    .replace(/^\uFEFF/, '') // إزالة BOM إن وُجد
    .trim()
    .toLowerCase();
}

// ============================================================
//  إيجاد الاسم الموحد للعمود بناءً على المرادفات
//  @returns {string|null} اسم الحقل الموحد أو null
// ============================================================
function resolveHeader(rawHeader) {
  const normalized = normalizeHeader(rawHeader);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(a => normalizeHeader(a) === normalized)) {
      return field;
    }
  }
  return null; // عمود غير معروف — نتجاهله
}

// ============================================================
//  تحليل النص وتقسيمه إلى صفوف
//  يدعم علامات التنصيص "..." التي تحتوي على فواصل
// ============================================================
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // "" داخل نص منصّص = " واحدة
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

// ============================================================
//  تحليل ملف CSV كامل
//  @param {string} text — محتوى الملف
//  @returns {Array} مصفوفة كائنات موحدة
// ============================================================
export function parseCSV(text) {
  // تنظيف BOM
  text = text.replace(/^\uFEFF/, '');

  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('ملف CSV فارغ أو يحتوي على سطر واحد فقط');
  }

  // تحليل رؤوس الأعمدة
  const rawHeaders = parseCSVLine(lines[0]).map(h => h.trim());
  const headerMap = rawHeaders.map(h => resolveHeader(h));

  // التحقق من وجود عمود الاسم
  if (!headerMap.includes('name')) {
    throw new Error('يجب أن يحتوي الملف على عمود "name" أو "الاسم"');
  }

  // تحليل الصفوف
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    // نتخطى الصفوف الفارغة
    if (values.every(v => !v || v.trim() === '')) continue;

    const obj = {};
    rawHeaders.forEach((_, idx) => {
      const field = headerMap[idx];
      if (!field) return; // عمود غير معروف
      obj[field] = (values[idx] || '').trim();
    });

    // التحقق: يجب أن يحتوي على اسم غير فارغ
    if (!obj.name || obj.name.trim() === '') continue;

    rows.push(obj);
  }

  return rows;
}

// ============================================================
//  تحليل ملف JSON
//  يقبل: مصفوفة كائنات، أو كائنًا واحدًا
// ============================================================
export function parseJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('ملف JSON غير صالح: ' + err.message);
  }

  const arr = Array.isArray(data) ? data : [data];

  // تصفية وتوحيد الحقول
  return arr
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const obj = {
        name: (item.name || item['الاسم'] || '').toString().trim(),
        specialty: (item.specialty || item['التخصص'] || '').toString().trim(),
        phone: (item.phone || item['الهاتف'] || '').toString().trim(),
        email: (item.email || item['البريد'] || '').toString().trim(),
        hire_date: (item.hire_date || item['تاريخ التعيين'] || '').toString().trim(),
        notes: (item.notes || item['ملاحظات'] || '').toString().trim()
      };
      return obj.name ? obj : null;
    })
    .filter(Boolean);
}

// ============================================================
//  معالجة ملف مُرفَق (من المستخدم)
//  - يكتشف النوع من الامتداد
//  - يقرأ الملف كـ UTF-8
//  - يستدعي callback بالمصفوفة
// ============================================================
export function handleFileUpload(file, callback) {
  if (!file) {
    callback([], 'لم يتم اختيار ملف');
    return;
  }

  const name = file.name.toLowerCase();
  const isCSV = name.endsWith('.csv') || name.endsWith('.txt');
  const isJSON = name.endsWith('.json');

  if (!isCSV && !isJSON) {
    callback([], 'صيغة الملف غير مدعومة. استخدمي CSV أو JSON');
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const teachers = isCSV ? parseCSV(text) : parseJSON(text);

      if (teachers.length === 0) {
        callback([], 'لم يتم العثور على سجلات صالحة في الملف');
        return;
      }

      callback(teachers, null);
    } catch (err) {
      console.error('Import error:', err);
      callback([], err.message);
    }
  };

  reader.onerror = () => {
    callback([], 'فشل قراءة الملف');
  };

  // قراءة الملف كـ UTF-8
  reader.readAsText(file, 'UTF-8');
}

// ============================================================
//  إنشاء قالب CSV جاهز للتحميل
//  يحتوي على سطر رأس + سطر مثال
// ============================================================
export function downloadCSVTemplate() {
  const header = 'name,specialty,phone,email,hire_date,notes';
  const example = 'نورة العتيبي,رياضيات,0501234567,noura@school.com,2024-09-01,معلمة متميزة';
  const csv = '\uFEFF' + header + '\n' + example;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'teachers-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}