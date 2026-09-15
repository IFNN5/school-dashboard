// ============================================================
//  app.js — الملف الرئيسي مع Logs تشخيصية شاملة
//  يُحمَّل Alpine ديناميكيًا في النهاية لضمان ترتيب صحيح
// ============================================================

// ===== مؤقت لتتبع الأزمنة =====
const __t0 = performance.now();
function log(msg, ...args) {
  const t = (performance.now() - __t0).toFixed(0).padStart(5);
  console.log(`[${t}ms] ${msg}`, ...args);
}

log('▶️ app.js: بدأ تحميل الاستيرادات...');

// ============================================================
//  الاستيرادات الثابتة
//  ملاحظة: هذه السطور تُنفَّذ قبل أي كود آخر في الملف (hoisting)
// ============================================================
import {
  initDB,
  getAllTeachers,
  addTeacher,
  updateTeacher,
  deleteTeacher,
  bulkInsertTeachers
} from './db.js';
log('✅ db.js تم استيراده');

import {
  initSearch,
  searchTeachers,
  addToIndex,
  removeFromIndex,
  reindexAll,
  indexSize
} from './search.js';
log('✅ search.js تم استيراده');

import {
  handleFileUpload,
  downloadCSVTemplate
} from './import.js';
log('✅ import.js تم استيراده');

import {
  loadTheme,
  applyTheme,
  saveTheme,
  resetTheme,
  exportTheme,
  importTheme,
  AVAILABLE_FONTS
} from './theme.js';
log('✅ theme.js تم استيراده');

import {
  exportJSON,
  exportCSV,
  readJSONFile
} from './export.js';
log('✅ export.js تم استيراده');

log('✅ كل الاستيرادات اكتملت');

// ============================================================
//  كائن Alpine.js الرئيسي
// ============================================================
function app() {
  log('🟢 app() تم استدعاؤها من Alpine');

  return {
    // ===== الحالة العامة =====
    tab: 'teachers',
    query: '',
    toast: '',
    _toastTimer: null,

    // ===== البيانات =====
    teachers: [],
    filteredTeachers: [],
    stats: { total: 0, indexed: 0 },

    // ===== النماذج =====
    showAddForm: false,
    showEditForm: false,
    newTeacher: {
      name: '', specialty: '', phone: '',
      email: '', hire_date: '', notes: ''
    },
    editingTeacher: null,

    // ===== الثيم =====
    theme: {},
    availableFonts: AVAILABLE_FONTS,

    // ============================================================
    //  التهيئة الرئيسية
    // ============================================================
    async init() {
      log('🟢 init(): بدء التهيئة');

      // 1) الثيم
      this.theme = loadTheme();
      applyTheme(this.theme);
      log('🟢 init(): الثيم مطبَّق');

      // 2) قاعدة البيانات
      try {
        await initDB();
        log('🟢 init(): قاعدة البيانات جاهزة');
      } catch (err) {
        console.error('🔴 Database init failed:', err);
        this.showToast('❌ فشل تهيئة قاعدة البيانات', 4000);
        return;
      }

      // 3) تحميل البيانات
      await this.loadTeachers();
      log('🟢 init(): البيانات محمّلة (' + this.teachers.length + ' معلمة)');

      // 4) Service Worker
      // ============================================================
      //  👇 كود تسجيل Service Worker — ابدأ من هنا
      // ============================================================
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js')
            .then(reg => log('🟢 Service Worker مسجَّل. النطاق: ' + reg.scope))
            .catch(err => console.error('🔴 Service Worker failed:', err));
        });
      }
      // ============================================================
      //  👆 نهاية كود Service Worker
      // ============================================================

      log('🟢 init(): اكتملت التهيئة بنجاح');
    },

    // ============================================================
    //  تحميل المعلمات
    // ============================================================
    async loadTeachers() {
      try {
        this.teachers = await getAllTeachers();
        reindexAll(this.teachers);
        this.filteredTeachers = this.teachers;
        this.stats.total = this.teachers.length;
        this.stats.indexed = indexSize();
        log('📚 loadTeachers(): ' + this.teachers.length + ' سجل');
      } catch (err) {
        console.error('🔴 loadTeachers error:', err);
        this.showToast('❌ فشل تحميل البيانات', 4000);
      }
    },

    // ============================================================
    //  البحث اللحظي
    // ============================================================
    liveSearch() {
      const q = (this.query || '').trim();
      if (q === '') {
        this.filteredTeachers = this.teachers;
        return;
      }
      try {
        this.filteredTeachers = searchTeachers(q);
      } catch (err) {
        console.error('🔴 Search error:', err);
        this.filteredTeachers = [];
      }
    },

    // ============================================================
    //  إضافة معلمة
    // ============================================================
    async saveNewTeacher(t) {
      if (!t.name || t.name.trim() === '') {
        this.showToast('⚠️ الاسم مطلوب', 3000);
        return;
      }
      try {
        const newT = await addTeacher(t);
        this.teachers.push(newT);
        addToIndex(newT);
        this.filteredTeachers = this.teachers;
        this.stats.total = this.teachers.length;
        this.newTeacher = {
          name: '', specialty: '', phone: '',
          email: '', hire_date: '', notes: ''
        };
        this.showAddForm = false;
        this.showToast('✅ تمت إضافة المعلمة بنجاح');
      } catch (err) {
        console.error('🔴 Add error:', err);
        this.showToast('❌ فشل إضافة المعلمة', 4000);
      }
    },

    // ============================================================
    //  فتح نموذج التعديل
    // ============================================================
    openEditForm(t) {
      this.editingTeacher = { ...t };
      this.showEditForm = true;
    },

    // ============================================================
    //  حفظ التعديل
    // ============================================================
    async saveEditTeacher() {
      const t = this.editingTeacher;
      if (!t || !t.name || t.name.trim() === '') {
        this.showToast('⚠️ الاسم مطلوب', 3000);
        return;
      }
      try {
        const updated = await updateTeacher(t.id, t);
        const idx = this.teachers.findIndex(x => x.id === t.id);
        if (idx !== -1) this.teachers[idx] = updated;
        removeFromIndex(t.id);
        addToIndex(updated);
        this.filteredTeachers = this.teachers;
        this.showEditForm = false;
        this.editingTeacher = null;
        this.showToast('✅ تم تحديث البيانات');
      } catch (err) {
        console.error('🔴 Update error:', err);
        this.showToast('❌ فشل التحديث', 4000);
      }
    },

    // ============================================================
    //  إلغاء التعديل
    // ============================================================
    cancelEdit() {
      this.showEditForm = false;
      this.editingTeacher = null;
    },

    // ============================================================
    //  حذف معلمة
    // ============================================================
    async deleteTeacher(id) {
      const teacher = this.teachers.find(x => x.id === id);
      const name = teacher ? teacher.name : '';
      if (!confirm(`هل أنتِ متأكدة من حذف "${name}"؟`)) return;
      try {
        await deleteTeacher(id);
        this.teachers = this.teachers.filter(x => x.id !== id);
        removeFromIndex(id);
        this.filteredTeachers = this.teachers;
        this.stats.total = this.teachers.length;
        this.showToast('🗑️ تم الحذف بنجاح');
      } catch (err) {
        console.error('🔴 Delete error:', err);
        this.showToast('❌ فشل الحذف', 4000);
      }
    },

    // ============================================================
    //  استيراد CSV / JSON
    // ============================================================
    importFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.json,.txt';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        handleFileUpload(file, async (teachers, error) => {
          if (error) {
            this.showToast('❌ ' + error, 4000);
            return;
          }
          try {
            const inserted = await bulkInsertTeachers(teachers);
            await this.loadTeachers();
            this.showToast(`✅ تم استيراد ${inserted} معلمة`);
          } catch (err) {
            console.error('🔴 Bulk insert error:', err);
            this.showToast('❌ فشل الاستيراد', 4000);
          }
        });
      };
      input.click();
    },

    // ============================================================
    //  استيراد نسخة احتياطية
    // ============================================================
    importBackup() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const data = await readJSONFile(file);
          const inserted = await bulkInsertTeachers(data);
          await this.loadTeachers();
          this.showToast(`✅ تم استيراد ${inserted} سجل`);
        } catch (err) {
          console.error('🔴 Import backup error:', err);
          this.showToast('❌ ' + err.message, 4000);
        }
      };
      input.click();
    },

    // ============================================================
    //  تصدير البيانات
    // ============================================================
    exportData(format = 'json') {
      if (this.teachers.length === 0) {
        this.showToast('⚠️ لا توجد بيانات للتصدير', 3000);
        return;
      }
      try {
        if (format === 'csv') {
          exportCSV(this.teachers, null, 'teachers');
        } else {
          exportJSON(this.teachers, 'teachers-backup');
        }
        this.showToast('📤 تم تصدير البيانات');
      } catch (err) {
        console.error('🔴 Export error:', err);
        this.showToast('❌ فشل التصدير', 4000);
      }
    },

    // ============================================================
    //  تحميل قالب CSV
    // ============================================================
    downloadTemplate() {
      downloadCSVTemplate();
      this.showToast('📄 تم تحميل القالب');
    },

    // ============================================================
    //  إدارة الثيم
    // ============================================================
    applyTheme() {
      applyTheme(this.theme);
    },

    saveTheme() {
      const ok = saveTheme(this.theme);
      this.showToast(ok ? '🎨 تم حفظ التخصيص' : '❌ فشل الحفظ', ok ? 2500 : 4000);
    },

    resetTheme() {
      if (!confirm('استعادة الألوان الافتراضية؟')) return;
      this.theme = resetTheme();
      this.showToast('🔄 تمت الاستعادة');
    },

    exportTheme() {
      exportTheme(this.theme);
      this.showToast('📤 تم تصدير الإعدادات');
    },

    importTheme() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          this.theme = await importTheme(file);
          this.showToast('✅ تم استيراد الإعدادات');
        } catch (err) {
          console.error('🔴 Import theme error:', err);
          this.showToast('❌ ' + err.message, 4000);
        }
      };
      input.click();
    },

    // ============================================================
    //  Toast
    // ============================================================
    showToast(msg, duration = 2500) {
      this.toast = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toast = ''; }, duration);
    }
  };
}

// ============================================================
//  تعريف app على النافذة
// ============================================================
window.app = app;
log('✅ window.app جاهز');

// ============================================================
//  تحميل Alpine.js ديناميكيًا ثم تشغيله
//  هذا يضمن أن app() معرّفة قبل أن يبدأ Alpine
// ============================================================
log('⏳ بدء تحميل Alpine.js...');

import('https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js')
  .then(mod => {
    log('✅ Alpine.js تم تحميله');
    window.Alpine = mod.default;
    mod.default.start();
    log('🚀 Alpine.start() — التطبيق بدأ');
  })
  .catch(err => {
    console.error('🔴 فشل تحميل Alpine:', err);
  });