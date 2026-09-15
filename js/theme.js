// ============================================================
//  theme.js — إدارة الألوان والتخصيص
//  - يخزّن الإعدادات في localStorage (تبقى بعد إغلاق المتصفح)
//  - يطبق الألوان عبر CSS Variables (فوري بدون إعادة تحميل)
// ============================================================

// ============================================================
//  المفتاح المستخدم في localStorage
// ============================================================
const STORAGE_KEY = 'school-dashboard-theme';

// ============================================================
//  الإعدادات الافتراضية
// ============================================================
const DEFAULT_THEME = {
  primary: '#2563eb',       // اللون الأساسي (أزرار، روابط)
  bg: '#f8fafc',            // خلفية الصفحة
  text: '#1e293b',          // لون النص العام
  sidebar: '#1e293b',       // خلفية الشريط الجانبي
  sidebarText: '#ffffff',   // نص الشريط الجانبي
  radius: 10,               // نصف قطر الحواف (بكسل)
  font: 'Segoe UI',         // نوع الخط
  schoolName: 'لوحة وكيلة المعلمات', // اسم المدرسة/التطبيق
  schoolLogo: ''            // شعار المدرسة (base64 أو رابط)
};

// ============================================================
//  قائمة الخطوط المتاحة
//  (نستخدم خطوط النظام لتفادي تحميل خطوط خارجية ثقيلة)
// ============================================================
export const AVAILABLE_FONTS = [
  { value: 'Segoe UI',       label: 'Segoe UI (افتراضي)' },
  { value: 'Tahoma',          label: 'Tahoma' },
  { value: 'Arial',           label: 'Arial' },
  { value: 'system-ui',       label: 'خط النظام' },
  { value: 'Cairo',           label: 'Cairo' },
  { value: 'Tajawal',         label: 'Tajawal' }
];

// ============================================================
//  تحميل الإعدادات من localStorage
//  - إذا لم تُوجد، تُرجع الافتراضية
//  - تدمج الإعدادات المحفوظة مع الافتراضية (لملء الناقص)
// ============================================================
export function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_THEME };

    const parsed = JSON.parse(saved);

    // دمج مع الافتراضية لضمان وجود كل المفاتيح
    return { ...DEFAULT_THEME, ...parsed };
  } catch (err) {
    console.warn('Failed to load theme:', err);
    return { ...DEFAULT_THEME };
  }
}

// ============================================================
//  تطبيق الإعدادات على CSS Variables
//  التغيير يظهر فوريًا في كل مكان
// ============================================================
export function applyTheme(theme) {
  if (!theme) return;

  const root = document.documentElement;

  // الألوان الأساسية
  if (theme.primary)      root.style.setProperty('--primary', theme.primary);
  if (theme.bg)           root.style.setProperty('--bg', theme.bg);
  if (theme.text)         root.style.setProperty('--text', theme.text);
  if (theme.sidebar)      root.style.setProperty('--sidebar', theme.sidebar);
  if (theme.sidebarText)  root.style.setProperty('--sidebar-text', theme.sidebarText);

  // الألوان المشتقة
  if (theme.primary) {
    root.style.setProperty('--primary-hover', darkenColor(theme.primary, 12));
  }

  // نصف قطر الحواف
  if (theme.radius !== undefined) {
    root.style.setProperty('--radius', `${theme.radius}px`);
  }

  // نوع الخط
  if (theme.font) {
    root.style.setProperty('--font',
      `'${theme.font}', 'Segoe UI', Tahoma, system-ui, sans-serif`);
  }

  // تحديث عنوان الصفحة
  if (theme.schoolName) {
    document.title = theme.schoolName;
  }
}

// ============================================================
//  حفظ الإعدادات في localStorage
// ============================================================
export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    return true;
  } catch (err) {
    console.error('Failed to save theme:', err);
    return false;
  }
}

// ============================================================
//  إعادة الإعدادات إلى الوضع الافتراضي
//  @returns {Object} الإعدادات الافتراضية بعد التطبيق
// ============================================================
export function resetTheme() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear theme:', err);
  }
  const fresh = { ...DEFAULT_THEME };
  applyTheme(fresh);
  return fresh;
}

// ============================================================
//  تصدير الإعدادات كملف JSON (نسخة احتياطية)
// ============================================================
export function exportTheme(theme) {
  const json = JSON.stringify(theme, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `theme-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
//  استيراد الإعدادات من ملف JSON
//  @returns {Promise<Object>} الإعدادات بعد الاستيراد
// ============================================================
export function importTheme(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('لم يتم اختيار ملف'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const merged = { ...DEFAULT_THEME, ...parsed };
        applyTheme(merged);
        saveTheme(merged);
        resolve(merged);
      } catch (err) {
        reject(new Error('ملف الثيم غير صالح: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsText(file, 'UTF-8');
  });
}

// ============================================================
//  دالة مساعدة: تغميق لون HEX بنسبة معينة
//  تُستخدم لاشتقاق لون primary-hover من primary
// ============================================================
function darkenColor(hex, percent = 10) {
  // إزالة #
  hex = hex.replace('#', '');

  // تحويل إلى RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // تغميق
  const factor = 1 - percent / 100;
  const nr = Math.max(0, Math.round(r * factor));
  const ng = Math.max(0, Math.round(g * factor));
  const nb = Math.max(0, Math.round(b * factor));

  // إرجاع HEX
  return '#' +
    nr.toString(16).padStart(2, '0') +
    ng.toString(16).padStart(2, '0') +
    nb.toString(16).padStart(2, '0');
}

// ============================================================
//  تصدير الإعدادات الافتراضية (لمن يحتاجها)
// ============================================================
export const DEFAULT_THEME_VALUES = { ...DEFAULT_THEME };