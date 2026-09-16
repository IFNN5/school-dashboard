// import.js — استيراد المعلمات من CSV أو JSON مع مرادفات عربية/إنجليزية للأعمدة

const COLUMN_SYNONYMS = {
  name: ['name', 'الاسم', 'اسم', 'الاسم الكامل', 'full_name', 'fullname', 'اسم المعلمة'],
  specialty: ['specialty', 'speciality', 'التخصص', 'تخصص', 'المادة', 'subject'],
  phone: ['phone', 'الهاتف', 'الجوال', 'رقم الجوال', 'mobile', 'رقم الهاتف'],
  email: ['email', 'البريد', 'البريد الإلكتروني', 'mail', 'e-mail', 'الايميل'],
  hire_date: ['hire_date', 'تاريخ التعيين', 'date', 'التاريخ', 'تاريخ المباشرة'],
  notes: ['notes', 'ملاحظات', 'ملاحظة', 'note']
};

function normalizeHeader(h) {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .replace(/["']/g, '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** يبني خريطة: فهرس العمود → اسم الحقل */
function mapHeaders(headers) {
  const map = {};
  headers.forEach((raw, i) => {
    const h = normalizeHeader(raw);
    for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
      if (synonyms.some(s => normalizeHeader(s) === h)) {
        map[i] = field;
        break;
      }
    }
  });
  return map;
}

/** مُحلِّل CSV يدعم الاقتباسات والفواصل داخل النص والأسطر المتعددة */
function splitCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',' || ch === ';') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/** تحليل نص CSV إلى مصفوفة كائنات معلمات */
export function parseCSV(text) {
  const rows = splitCSV(text);
  if (!rows.length) return { teachers: [], errors: ['الملف فارغ'] };

  const headerMap = mapHeaders(rows[0]);
  const errors = [];

  if (!Object.values(headerMap).includes('name')) {
    return {
      teachers: [],
      errors: ['لم يُعثر على عمود الاسم. استخدمي عنوان "name" أو "الاسم" في السطر الأول.']
    };
  }

  const teachers = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const t = {};
    for (const [idx, field] of Object.entries(headerMap)) {
      const v = (cells[idx] || '').trim();
      if (v) t[field] = v;
    }
    if (!t.name) { errors.push(`السطر ${r + 1}: الاسم فارغ — تم تخطيه`); continue; }
    teachers.push(t);
  }

  return { teachers, errors };
}

/** تحليل JSON — يقبل مصفوفة مباشرة أو كائناً يحوي teachers/data */
export function parseJSON(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch (e) {
    return { teachers: [], errors: ['ملف JSON غير صالح: ' + e.message] };
  }

  let list = data;
  if (!Array.isArray(list)) {
    list = data.teachers || data.data || data.rows || null;
  }
  if (!Array.isArray(list)) {
    return { teachers: [], errors: ['المتوقع مصفوفة معلمات أو كائن يحوي المفتاح teachers'] };
  }

  const errors = [];
  const teachers = [];

  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') { errors.push(`العنصر ${i + 1}: غير صالح`); return; }

    const t = {};
    const keys = Object.keys(item);
    for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
      const key = keys.find(k => synonyms.some(s => normalizeHeader(s) === normalizeHeader(k)));
      if (key && String(item[key]).trim()) t[field] = String(item[key]).trim();
    }

    if (!t.name) { errors.push(`العنصر ${i + 1}: الاسم فارغ — تم تخطيه`); return; }
    teachers.push(t);
  });

  return { teachers, errors };
}

/** قراءة ملف مرفوع وتحليله حسب امتداده */
export function handleFileUpload(file, cb) {
  if (!file) { cb({ teachers: [], errors: ['لم يُختر أي ملف'] }); return; }

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const isJSON = /\.json$/i.test(file.name) || /^\s*[\[{]/.test(text);
    cb(isJSON ? parseJSON(text) : parseCSV(text));
  };
  reader.onerror = () => cb({ teachers: [], errors: ['تعذّرت قراءة الملف'] });
  reader.readAsText(file, 'utf-8');
}

/** تنزيل قالب CSV جاهز للتعبئة */
export function downloadCSVTemplate() {
  const csv = '\uFEFF' + [
    'name,specialty,phone,email,hire_date,notes',
    'نورة العتيبي,رياضيات,0501234567,noura@school.com,2024-09-01,',
    'سارة القحطاني,لغة عربية,0509876543,sara@school.com,2023-08-15,'
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'قالب-المعلمات.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
