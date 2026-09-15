// ============================================================
//  app.js — الملف الرئيسي لمنطق التطبيق (Alpine.js)
//  يربط كل الوحدات: DB + Search + Import + Export + Theme
// ============================================================

import {
  initDB,
  getAllTeachers,
  addTeacher,
  updateTeacher,
  deleteTeacher,
  bulkInsertTeachers,
  countTeachers
} from './db.js';

import {
  initSearch,
  searchTeachers,
  addToIndex,
  removeFromIndex,
  reindexAll,
  indexSize
} from './search.js';

import {
  handleFileUpload,
  downloadCSVTemplate
} from './import.js';

import {
  loadTheme,
  applyTheme,
  saveTheme,
  resetTheme,
  exportTheme,
  importTheme,
  AVAILABLE_FONTS
} from './theme.js';

import {
  exportJSON,
  exportCSV,
  readJSONFile
} from './export.js';

// ============================================================
//  كائن Alpine.js الرئيسي
// ============================================================
function app() {
  return {
    // ===== الحالة العامة =====
    tab: 'teachers',        // التبويب النشط
    loading: true,          // حالة التحميل الأولي
    query: '',              // نص البحث
    toast: '',              // رسالة التنبيه
    _toastTimer: null,

    // ===== البيانات =====
    teachers: [],           // كل المعلمات
    filteredTeachers: [],   // المعلمات بعد البحث
    stats: { total: 0, indexed: 0 },

    // ===== نماذج =====
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
      // 1) تحميل الثيم وتطبيقه أولًا (لمنع الوميض)
      this.theme = loadTheme();
      applyTheme(this.theme);

      // 2) تهيئة قاعدة البيانات
      try {
        await initDB();
        console.log('✅ Database initialized');
      } catch (err) {
        console.error('❌ Database init failed:', err);
        this.showToast('❌ فشل تهيئة قاعدة البيانات', 4000);
        this.loading = false;
        return;
      }

      // 3) تحميل البيانات وتجهيز البحث
      await this.loadTeachers();

      // 4) إنهاء حالة التحميل
      this.loading = false;

      // ============================================================
      //  👇👇👇  كود تسجيل Service Worker — ابدأ من هنا  👇👇👇
      // ============================================================
      //  مسؤول عن تفعيل العمل أوفلاين:
      //  - يخزّن ملفات التطبيق في الكاش
      //  - يجعل التطبيق يعمل بدون إنترنت بعد أول تحميل
      //  - يُسجَّل في نهاية init() حتى لا يتنافس مع تحميل الصفحة
      // ============================================================
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js')
            .then(reg => {
              console.log('✅ Service Worker registered. Scope:', reg.scope);
            })
            .catch(err => {
              console.error('❌ Service Worker registration failed:', err);
            });
        });
      }
      // ============================================================
      //  👆👆👆  نهاية كود تسجيل Service Worker  👆👆👆
      // ============================================================
    },

    // ============================================================
    //  تحميل كل المعلمات وتحديث البحث
    // ============================================================
    async loadTeachers() {
      try {
        this.teachers = await getAllTeachers();
        reindexAll(this.teachers);
        this.filteredTeachers = this.teachers;
        this.stats.total = this.teachers.length;
        this.stats.indexed = indexSize();
      } catch (err) {
        console.error('loadTeachers error:', err);
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
        const results = searchTeachers(q);
        this.filteredTeachers = results;
      } catch (err) {
        console.error('Search error:', err);
        this.filteredTeachers = [];
      }
    },

    // ============================================================
    //  مسح البحث
    // ============================================================
    clearSearch() {
      this.query = '';
      this.filteredTeachers = this.teachers;
    },

    // ============================================================
    //  إضافة معلمة جديدة
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

        // إعادة تعيين النموذج
        this.newTeacher = {
          name: '', specialty: '', phone: '',
          email: '', hire_date: '', notes: ''
        };
        this.showAddForm = false;

        this.showToast('✅ تمت إضافة المعلمة بنجاح');
      } catch (err) {
        console.error('Add error:', err);
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

        // تحديث المصفوفة
        const idx = this.teachers.findIndex(x => x.id === t.id);
        if (idx !== -1) this.teachers[idx] = updated;

        // تحديث البحث
        removeFromIndex(t.id);
        addToIndex(updated);

        this.filteredTeachers = this.teachers;
        this.showEditForm = false;
        this.editingTeacher = null;

        this.showToast('✅ تم تحديث البيانات');
      } catch (err) {
        console.error('Update error:', err);
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
        console.error('Delete error:', err);
        this.showToast('❌ فشل الحذف', 4000);
      }
    },

    // ============================================================
    //  استيراد CSV / JSON (إضافة للموجود)
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
            console.error('Bulk insert error:', err);
            this.showToast('❌ فشل الاستيراد', 4000);
          }
        });
      };

      input.click();
    },

    // ============================================================
    //  استيراد نسخة احتياطية JSON
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
          console.error('Import backup error:', err);
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
        console.error('Export error:', err);
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
      if (ok) {
        this.showToast('🎨 تم حفظ التخصيص');
      } else {
        this.showToast('❌ فشل الحفظ', 4000);
      }
    },

    async resetTheme() {
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
          console.error('Import theme error:', err);
          this.showToast('❌ ' + err.message, 4000);
        }
      };

      input.click();
    },

    // ============================================================
    //  رسالة Toast
    //  @param {string} msg — نص الرسالة
    //  @param {number} duration — مدة العرض بالميلي ثانية
    // ============================================================
    showToast(msg, duration = 2500) {
      this.toast = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.toast = '';
      }, duration);
    }
  };
}

// ============================================================
//  ربط Alpine.js
// ============================================================
window.app = app;