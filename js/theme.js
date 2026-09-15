const defaultTheme = {
  primary: '#2563eb',
  bg: '#f8fafc',
  text: '#1e293b',
  sidebar: '#1e293b',
  sidebarText: '#ffffff'
};

export function loadTheme() {
  const saved = localStorage.getItem('school-theme');
  return saved ? JSON.parse(saved) : defaultTheme;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--sidebar', theme.sidebar);
  root.style.setProperty('--sidebar-text', theme.sidebarText);
}

export function saveTheme(theme) {
  localStorage.setItem('school-theme', JSON.stringify(theme));
}