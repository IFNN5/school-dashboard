// theme.js — تخصيص المظهر عبر متغيرات CSS، محفوظ في localStorage

const STORAGE_KEY = 'school-dashboard-theme';

export const AVAILABLE_FONTS = [
  { value: "'Segoe UI', Tahoma, system-ui, sans-serif", label: 'Segoe UI' },
  { value: "Tahoma, 'Segoe UI', sans-serif", label: 'Tahoma' },
  { value: "Arial, Helvetica, sans-serif", label: 'Arial' },
  { value: "system-ui, -apple-system, sans-serif", label: 'خط النظام' },
  { value: "'Cairo', 'Segoe UI', sans-serif", label: 'Cairo' },
  { value: "'Tajawal', 'Segoe UI', sans-serif", label: 'Tajawal' }
];

export const DEFAULT_THEME_VALUES = {
  primary: '#2563eb',
  bg: '#f8fafc',
  text: '#1e293b',
  sidebar: '#1e293b',
  sidebarText: '#ffffff',
  radius: 10,
  font: "'Segoe UI', Tahoma, system-ui, sans-serif"
};

let current = { ...DEFAULT_THEME_VALUES };

/** تحويل لون hex إلى rgb */
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** تفتيح أو تغميق لون بنسبة (-1 إلى 1) */
function shade(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return rgbToHex(
    (t - rgb.r) * p + rgb.r,
    (t - rgb.g) * p + rgb.g,
    (t - rgb.b) * p + rgb.b
  );
}

/** لون نص مناسب (أبيض/داكن) حسب سطوع الخلفية */
export function contrastText(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const l = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return l > 0.6 ? '#1e293b' : '#ffffff';
}

export function getTheme() {
  return { ...current };
}

/** قراءة الثيم من localStorage */
export function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      current = { ...DEFAULT_THEME_VALUES, ...saved };
    }
  } catch (e) {
    console.warn('[theme] تعذّرت قراءة الثيم المحفوظ، سيُستخدم الافتراضي');
    current = { ...DEFAULT_THEME_VALUES };
  }
  return { ...current };
}

/** تطبيق الثيم فوراً على :root */
export function applyTheme(theme) {
  if (theme) current = { ...current, ...theme };
  const root = document.documentElement;
  const t = current;

  root.style.setProperty('--primary', t.primary);
  root.style.setProperty('--primary-hover', shade(t.primary, -0.18));
  root.style.setProperty('--primary-soft', shade(t.primary, 0.88));
  root.style.setProperty('--primary-text', contrastText(t.primary));
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--text', t.text);
  root.style.setProperty('--text-muted', shade(t.text, 0.42));
  root.style.setProperty('--border', shade(t.text, 0.86));
  root.style.setProperty('--sidebar', t.sidebar);
  root.style.setProperty('--sidebar-text', t.sidebarText);
  root.style.setProperty('--sidebar-hover', shade(t.sidebar, 0.12));
  root.style.setProperty('--radius', `${t.radius}px`);
  root.style.setProperty('--radius-sm', `${Math.max(2, Math.round(t.radius * 0.6))}px`);
  root.style.setProperty('--font', t.font);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.primary);

  return { ...current };
}

/** حفظ الثيم الحالي */
export function saveTheme(theme) {
  if (theme) current = { ...current, ...theme };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('[theme] تعذّر حفظ الثيم');
    return false;
  }
  applyTheme();
  return true;
}

/** العودة للإعدادات الافتراضية */
export function resetTheme() {
  current = { ...DEFAULT_THEME_VALUES };
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* تجاهل */ }
  applyTheme();
  return { ...current };
}

/** تصدير ملف الثيم */
export function exportTheme() {
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'مظهر-اللوحة.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** استيراد ملف ثيم — يُعيد Promise بالثيم المطبَّق */
export function importTheme(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('لم يُختر أي ملف')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const clean = {};
        for (const key of Object.keys(DEFAULT_THEME_VALUES)) {
          if (parsed[key] !== undefined) clean[key] = parsed[key];
        }
        saveTheme(clean);
        resolve({ ...current });
      } catch (e) {
        reject(new Error('ملف المظهر غير صالح'));
      }
    };
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    reader.readAsText(file, 'utf-8');
  });
}
