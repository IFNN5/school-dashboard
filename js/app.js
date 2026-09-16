// ============================================================
//  app.js — الملف الرئيسي لمنطق التطبيق (Alpine.js)
//  يربط كل الوحدات: DB + Search + Import + Export + Theme + Attendance
// ============================================================

// ===== مؤقت تتبع الأزمنة =====
const __t0 = performance.now();
function log(msg, ...args) {
  const t = (performance.now() - __t0).toFixed(0).padStart(5);
  console.log(`[${t}ms] ${msg}`, ...args);
}

log('▶️ app.js: بدء تحميل الاستيرادات...');

// ============================================================
//  الاستيرادات
// ============================================================
import {
  initDB,
  getAllTeachers,
  getTeacher,
  addTeacher,
  updateTeacher,
  deleteTeacher,
  toggleTeacherActive,
  bulkInsertTeachers,
  countTeachers,
  getAttendanceByDate,
  saveAttendanceBulk,
  deleteAttendanceByDate,
  getAttendanceHistory,
  getTeacherStats,
  getGeneralStats,
  getTeachersRankedByAbsence,
  setHoliday,
  removeHoliday,
  getDayStatus,
  getHolidays,
  ATTENDANCE_STATUSES
} from './db.js';
log('✅ db.js');

import {
  initSearch,
  searchTeachers,
  addToIndex,
  removeFromIndex,
  reindexAll,
  indexSize
} from './search.js';
log('✅ search.js');

import {
  handleFileUpload,
  downloadCSVTemplate
} from './import.js';
log('✅ import.js');

import {
  loadTheme,
  applyTheme,
  saveTheme,
  resetTheme,
  exportTheme,
  importTheme,
  AVAILABLE_FONTS
} from './theme.js';
log('✅ theme.js');

import {
  exportJSON,
  exportCSV,
  readJSONFile
} from './export.js';
log('✅ export.js');

import {
  getStatusList,
  getStatusColor,
  todayHijriKey,
  navigateDay,
  checkWorkingDay,
  getDayRoster,
  saveDayAttendance,
  getCurrentHijriMonthRange,
  summarizeStats,
  calculatePresenceRate,
  generateDailyReport,
  generateTeacherReport,
  generateGeneralReport,
  generateHistoryReport,
  generateHolidaysReport,
  formatHijri,
  formatHijriShort,
  formatGregorianShort,
  hijriToKey,
  keyToHijri,
  getWeekdayAr,
  getCurrentHijri,
  toGregorian,
  HIJRI_MONTHS_AR,
  WEEKDAYS_AR
} from './attendance.js';
log('✅ attendance.js');

log('✅ كل الاستيرادات اكتملت');

// ============================================================
//  كائن Alpine.js الرئيسي
// ============================================================
function app() {
  log('🟢 app() تم استدعاؤها');

  return {
    // ===== الحالة العامة =====
    tab: 'teachers',
    query: '',
    toast: '',
    _toastTimer: null,

    // ===== المعلمات =====
    teachers: [],
    filteredTeachers: [],
    stats: { total: 0, indexed: 0 },
    showInactiveTeachers: false,

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
    //  قسم الحضور
    // ============================================================
    attendanceDate: '',
    attendanceDateLabel: '',
    attendanceDateGregorian: '',
    roster: [],
    dayStatus: { isWorking: true, reason: null },
    isHoliday: false,
    holidayName: '',

    statusList: [],
    ATTENDANCE_STATUSES,

    // ============================================================
    //  قسم السجل
    // ============================================================
    historyFilters: {
      from: '',
      to: '',
      teacher_id: '',
      status: ''
    },
    historyRecords: [],
    historyLoading: false,

    // ============================================================
    //  قسم التقارير
    // ============================================================
    reportTab: 'daily',

    reportRange: {
      from: '',
      to: '',
      label: ''
    },

    reportTeacher: {
      id: '',
      name: ''
    },

    dashboardStats: {
      todayPresent: 0,
      todayAbsent: 0,
      todayLate: 0,
      todayExcused: 0,
      todayNotRecorded: 0
    },

    // ============================================================
    //  التهيئة الرئيسية
    // ============================================================
    async init() {
      log('🟢 init(): بدء التهيئة');

      this.theme = loadTheme();
      applyTheme(this.theme);
      log('🟢 الثيم مطبَّق');

      try {
        await initDB();
        log('🟢 قاعدة البيانات جاهزة');
      } catch (err) {
        console.error('🔴 DB init failed:', err);
        this.showToast('❌ فشل تهيئة قاعدة البيانات', 4000);
        return;
      }

      this.statusList = getStatusList();

      await this.loadTeachers();
      log('🟢 المعلمات محمّلة (' + this.teachers.length + ')');

      this.attendanceDate = todayHijriKey();
      await this.loadDayRoster();
      log('🟢 حضور اليوم محمّل');

      const range = getCurrentHijriMonthRange();
      this.reportRange.from = range.from;
      this.reportRange.to = range.to;
      this.reportRange.label = range.label;

      // ============================================================
      //  👇 تسجيل Service Worker — ابدأ من هنا
      // ============================================================
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js')
            .then(reg => log('🟢 SW مسجَّل. النطاق: ' + reg.scope))
            .catch(err => console.error('🔴 SW failed:', err));
        });
      }
      // ============================================================
      //  👆 نهاية Service Worker
      // ============================================================

      log('🟢 init(): اكتملت بنجاح');
    },

    // ============================================================
    //  دوال المعلمات
    // ============================================================
    async loadTeachers() {
      try {
        this.teachers = await getAllTeachers(this.showInactiveTeachers);
        reindexAll(this.teachers);
        this.filteredTeachers = this.teachers;
        this.stats.total = this.teachers.length;
        this.stats.indexed = indexSize();
      } catch (err) {
        console.error('🔴 loadTeachers:', err);
        this.showToast('❌ فشل تحميل البيانات', 4000);
      }
    },

    async toggleShowInactive() {
      this.showInactiveTeachers = !this.showInactiveTeachers;
      await this.loadTeachers();
    },

    liveSearch() {
      const q = (this.query || '').trim();
      if (q === '') {
        this.filteredTeachers = this.teachers;
        return;
      }
      try {
        this.filteredTeachers = searchTeachers(q);
      } catch (err) {
        console.error('🔴 Search:', err);
        this.filteredTeachers = [];
      }
    },

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
        this.showToast('✅ تمت الإضافة');
      } catch (err) {
        console.error('🔴 Add:', err);
        this.showToast('❌ فشل الإضافة', 4000);
      }
    },

    openEditForm(t) {
      this.editingTeacher = { ...t };
      this.showEditForm = true;
    },

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
        this.showToast('✅ تم التحديث');
      } catch (err) {
        console.error('🔴 Update:', err);
        this.showToast('❌ فشل التحديث', 4000);
      }
    },

    cancelEdit() {
      this.showEditForm = false;
      this.editingTeacher = null;
    },

    async deleteTeacher(id) {
      const teacher = this.teachers.find(x => x.id === id);
      const name = teacher ? teacher.name : '';
      if (!confirm(`حذف "${name}" نهائياً؟ سيتم حذف كل سجلات حضورها.`)) return;
      try {
        await deleteTeacher(id);
        this.teachers = this.teachers.filter(x => x.id !== id);
        removeFromIndex(id);
        this.filteredTeachers = this.teachers;
        this.stats.total = this.teachers.length;
        this.showToast('🗑️ تم الحذف');
      } catch (err) {
        console.error('🔴 Delete:', err);
        this.showToast('❌ فشل الحذف', 4000);
      }
    },

    async toggleTeacherActive(id) {
      const teacher = this.teachers.find(x => x.id === id);
      if (!teacher) return;
      const newState = !teacher.is_active;
      const msg = newState ? 'تفعيل' : 'تعطيل';
      if (!confirm(`هل تريدين ${msg} "${teacher.name}"؟`)) return;
      try {
        const updated = await toggleTeacherActive(id, newState);
        const idx = this.teachers.findIndex(x => x.id === id);
        if (idx !== -1) this.teachers[idx] = updated;
        await this.loadTeachers();
        this.showToast(`✅ تم ${msg} المعلمة`);
      } catch (err) {
        console.error('🔴 Toggle active:', err);
        this.showToast('❌ فشلت العملية', 4000);
      }
    },

    // ============================================================
    //  دوال الحضور
    // ============================================================
    async loadDayRoster() {
      if (!this.attendanceDate) return;

      try {
        const hijri = keyToHijri(this.attendanceDate);
        const greg = toGregorian(hijri.year, hijri.month, hijri.day);
        const weekday = getWeekdayAr(greg);

        this.attendanceDateLabel = `${weekday}، ${formatHijri(hijri)}`;
        this.attendanceDateGregorian = formatGregorianShort(greg);

        this.dayStatus = await checkWorkingDay(this.attendanceDate);
        this.isHoliday = !this.dayStatus.isWorking;

        this.roster = await getDayRoster(this.attendanceDate);

        this.roster = this.roster.map(item => ({
          teacher: item.teacher,
          status: item.attendance?.status || null,
          time: item.attendance?.time || '',
          note: item.attendance?.note || '',
          hasRecord: !!item.attendance
        }));

        this.calculateDashboardStats();

        if (this.isHoliday) {
          const status = await getDayStatus(this.attendanceDate);
          this.holidayName = status?.holiday_name || this.dayStatus.reason || 'إجازة';
        } else {
          this.holidayName = '';
        }
      } catch (err) {
        console.error('🔴 loadDayRoster:', err);
        this.showToast('❌ فشل تحميل بيانات اليوم', 4000);
      }
    },

    async navigateDay(delta) {
      this.attendanceDate = navigateDay(this.attendanceDate, delta);
      await this.loadDayRoster();
    },

    async goToToday() {
      this.attendanceDate = todayHijriKey();
      await this.loadDayRoster();
    },

    setStatus(teacherId, status) {
      const item = this.roster.find(r => r.teacher.id === teacherId);
      if (!item) return;
      if (item.status === status) {
        item.status = null;
        item.time = '';
        return;
      }
      item.status = status;
      if (!['late', 'excused'].includes(status)) {
        item.time = '';
      }
    },

    setTime(teacherId, time) {
      const item = this.roster.find(r => r.teacher.id === teacherId);
      if (item) item.time = time;
    },

    setNote(teacherId, note) {
      const item = this.roster.find(r => r.teacher.id === teacherId);
      if (item) item.note = note;
    },

    setAllPresent() {
      this.roster.forEach(item => {
        if (!item.status) item.status = 'present';
      });
      this.calculateDashboardStats();
      this.showToast('✅ تم تعيين الباقي كحاضرة');
    },

    clearDayUI() {
      if (!confirm('مسح كل التسجيلات في هذا اليوم من الواجهة؟')) return;
      this.roster.forEach(item => {
        item.status = null;
        item.time = '';
        item.note = '';
      });
      this.calculateDashboardStats();
    },

    async deleteDayFromDB() {
      if (!confirm('حذف كل سجلات هذا اليوم نهائياً من قاعدة البيانات؟')) return;
      try {
        await deleteAttendanceByDate(this.attendanceDate);
        await this.loadDayRoster();
        this.showToast('🗑️ تم حذف سجلات اليوم');
      } catch (err) {
        console.error('🔴 Delete day:', err);
        this.showToast('❌ فشل الحذف', 4000);
      }
    },

    async saveDay() {
      const unassigned = this.roster.filter(r => !r.status);
      if (unassigned.length > 0) {
        const names = unassigned.slice(0, 3).map(r => r.teacher.name).join('، ');
        const more = unassigned.length > 3 ? ` و${unassigned.length - 3} أخريات` : '';
        if (!confirm(`يوجد ${unassigned.length} معلمة بدون حالة (${names}${more}). متابعة الحفظ؟`)) {
          return;
        }
      }

      const missingTime = this.roster.filter(r =>
        r.status && ['late', 'excused'].includes(r.status) && !r.time
      );
      if (missingTime.length > 0) {
        const names = missingTime.slice(0, 3).map(r => r.teacher.name).join('، ');
        this.showToast(`⚠️ يجب تسجيل وقت ${names}`, 4000);
        return;
      }

      try {
        const records = this.roster
          .filter(r => r.status)
          .map(r => ({
            teacher_id: r.teacher.id,
            status: r.status,
            time: r.time || null,
            note: r.note || null
          }));

        if (records.length === 0) {
          this.showToast('⚠️ لا توجد بيانات للحفظ', 3000);
          return;
        }

        const saved = await saveDayAttendance(this.attendanceDate, records);
        this.showToast(`✅ تم حفظ ${saved} سجل`);
        await this.loadDayRoster();
      } catch (err) {
        console.error('🔴 saveDay:', err);
        this.showToast('❌ فشل الحفظ', 4000);
      }
    },

    calculateDashboardStats() {
      const s = {
        todayPresent: 0, todayAbsent: 0, todayLate: 0,
        todayExcused: 0, todayNotRecorded: 0
      };
      this.roster.forEach(r => {
        if (!r.status) s.todayNotRecorded++;
        else if (r.status === 'present') s.todayPresent++;
        else if (r.status === 'absent' || r.status === 'sick_leave') s.todayAbsent++;
        else if (r.status === 'late') s.todayLate++;
        else if (r.status === 'excused') s.todayExcused++;
      });
      this.dashboardStats = s;
    },

    async toggleHoliday() {
      const hijri = keyToHijri(this.attendanceDate);
      const greg = toGregorian(hijri.year, hijri.month, hijri.day);
      const gregKey = formatGregorianShort(greg);

      if (this.isHoliday) {
        if (!confirm('إلغاء الإجازة وجعل اليوم يوم عمل؟')) return;
        try {
          await removeHoliday(this.attendanceDate);
          await this.loadDayRoster();
          this.showToast('✅ تم إلغاء الإجازة');
        } catch (err) {
          console.error('🔴 removeHoliday:', err);
          this.showToast('❌ فشلت العملية', 4000);
        }
      } else {
        const name = prompt('اسم الإجازة (اتركيه فارغاً للإجازة العامة):', '');
        if (name === null) return;
        try {
          await setHoliday(this.attendanceDate, gregKey, true, name || 'إجازة');
          await this.loadDayRoster();
          this.showToast('✅ تم تعيين اليوم كإجازة');
        } catch (err) {
          console.error('🔴 setHoliday:', err);
          this.showToast('❌ فشلت العملية', 4000);
        }
      }
    },

    // ============================================================
    //  دوال السجل
    // ============================================================
    async loadHistory() {
      this.historyLoading = true;
      try {
        const filters = {};
        if (this.historyFilters.from) filters.from = this.historyFilters.from;
        if (this.historyFilters.to) filters.to = this.historyFilters.to;
        if (this.historyFilters.teacher_id) filters.teacher_id = parseInt(this.historyFilters.teacher_id);
        if (this.historyFilters.status) filters.status = this.historyFilters.status;
        this.historyRecords = await getAttendanceHistory(filters);
      } catch (err) {
        console.error('🔴 loadHistory:', err);
        this.showToast('❌ فشل تحميل السجل', 4000);
      } finally {
        this.historyLoading = false;
      }
    },

    clearHistoryFilters() {
      this.historyFilters = { from: '', to: '', teacher_id: '', status: '' };
      this.historyRecords = [];
    },

    formatRecordDate(key) {
      try { return formatHijri(keyToHijri(key)); }
      catch { return key; }
    },

    getStatusLabel(status) {
      return ATTENDANCE_STATUSES[status] || status;
    },

    getStatusColor(status) {
      return getStatusColor(status);
    },

    // ============================================================
    //  دوال التقارير
    // ============================================================
    async exportDailyReport() {
      try {
        await generateDailyReport(this.attendanceDate);
        this.showToast('📄 تم توليد التقرير اليومي');
      } catch (err) {
        console.error('🔴 exportDailyReport:', err);
        this.showToast('❌ فشل التقرير', 4000);
      }
    },

    async exportTeacherReport() {
      if (!this.reportTeacher.id) {
        this.showToast('⚠️ اختاري معلمة', 3000);
        return;
      }
      if (!this.reportRange.from || !this.reportRange.to) {
        this.showToast('⚠️ حدّدي الفترة', 3000);
        return;
      }
      try {
        const teacher = this.teachers.find(t => t.id === parseInt(this.reportTeacher.id));
        await generateTeacherReport(
          parseInt(this.reportTeacher.id),
          teacher?.name || '',
          this.reportRange.from,
          this.reportRange.to
        );
        this.showToast('📄 تم توليد تقرير المعلمة');
      } catch (err) {
        console.error('🔴 exportTeacherReport:', err);
        this.showToast('❌ فشل التقرير', 4000);
      }
    },

    async exportGeneralReport() {
      if (!this.reportRange.from || !this.reportRange.to) {
        this.showToast('⚠️ حدّدي الفترة', 3000);
        return;
      }
      try {
        const fromHijri = formatHijri(keyToHijri(this.reportRange.from));
        const toHijri = formatHijri(keyToHijri(this.reportRange.to));
        await generateGeneralReport(
          this.reportRange.from,
          this.reportRange.to,
          fromHijri,
          toHijri
        );
        this.showToast('📄 تم توليد التقرير العام');
      } catch (err) {
        console.error('🔴 exportGeneralReport:', err);
        this.showToast('❌ فشل التقرير', 4000);
      }
    },

    async exportHistoryReport() {
      try {
        const filters = {};
        if (this.historyFilters.from) filters.from = this.historyFilters.from;
        if (this.historyFilters.to) filters.to = this.historyFilters.to;
        if (this.historyFilters.teacher_id) filters.teacher_id = parseInt(this.historyFilters.teacher_id);
        if (this.historyFilters.status) filters.status = this.historyFilters.status;
        await generateHistoryReport(filters);
        this.showToast('📄 تم توليد تقرير السجل');
      } catch (err) {
        console.error('🔴 exportHistoryReport:', err);
        this.showToast('❌ فشل التقرير', 4000);
      }
    },

    async exportHolidaysReport() {
      if (!this.reportRange.from || !this.reportRange.to) {
        this.showToast('⚠️ حدّدي الفترة', 3000);
        return;
      }
      try {
        await generateHolidaysReport(this.reportRange.from, this.reportRange.to);
        this.showToast('📄 تم توليد تقرير الإجازات');
      } catch (err) {
        console.error('🔴 exportHolidaysReport:', err);
        this.showToast('❌ فشل التقرير', 4000);
      }
    },

    setCurrentMonthRange() {
      const range = getCurrentHijriMonthRange();
      this.reportRange.from = range.from;
      this.reportRange.to = range.to;
      this.reportRange.label = range.label;
    },

    // ============================================================
    //  دوال الاستيراد والتصدير
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
            console.error('🔴 Bulk insert:', err);
            this.showToast('❌ فشل الاستيراد', 4000);
          }
        });
      };
      input.click();
    },

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
          console.error('🔴 Import backup:', err);
          this.showToast('❌ ' + err.message, 4000);
        }
      };
      input.click();
    },

    exportData(format = 'json') {
      if (this.teachers.length === 0) {
        this.showToast('⚠️ لا توجد بيانات', 3000);
        return;
      }
      try {
        if (format === 'csv') {
          exportCSV(this.teachers, null, 'teachers');
        } else {
          exportJSON(this.teachers, 'teachers-backup');
        }
        this.showToast('📤 تم التصدير');
      } catch (err) {
        console.error('🔴 Export:', err);
        this.showToast('❌ فشل التصدير', 4000);
      }
    },

    downloadTemplate() {
      downloadCSVTemplate();
      this.showToast('📄 تم تحميل القالب');
    },

    // ============================================================
    //  دوال الثيم
    // ============================================================
    applyTheme() { applyTheme(this.theme); },

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
          console.error('🔴 Import theme:', err);
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
//  ربط app على النافذة — يجب أن يكون قبل Alpine
// ============================================================
window.app = app;
log('✅ window.app جاهز');

// ============================================================
//  تحميل Alpine.js
//  نتركه يبدأ تلقائياً — لا نستدعي .start() يدوياً
//  window.app معرَّف قبله، فيجده Alpine جاهزاً
// ============================================================
log('⏳ بدء تحميل Alpine.js...');

import('https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js')
  .then(() => {
    log('🚀 Alpine.js تم تحميله وبدأ تلقائياً');
  })
  .catch(err => {
    console.error('🔴 فشل تحميل Alpine:', err);
  });