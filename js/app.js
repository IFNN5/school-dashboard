// app.js — مكوّن Alpine الرئيسي: يربط الواجهة بقاعدة البيانات وبقية الوحدات

window.deferLoadingAlpine = true;

import * as db from './db.js';
import * as hijri from './hijri.js';
import * as att from './attendance.js';
import * as sched from './schedule.js';
import * as search from './search.js';
import * as importer from './import.js';
import * as exporter from './export.js';
import * as theme from './theme.js';

const CALENDAR_KEY = 'school-dashboard-calendar-mode';

function app() {
  return {
    /* ---------------- الحالة العامة ---------------- */
    booted: false,
    bootError: '',
    bootMessage: 'جارٍ تجهيز قاعدة البيانات…',
    tab: 'teachers',
    toasts: [],
    toastId: 0,

    tabs: [
      { key: 'teachers',   label: 'المعلمات' },
      { key: 'attendance', label: 'الحضور' },
      { key: 'history',    label: 'السجل' },
      { key: 'reports',    label: 'التقارير' },
      { key: 'schedule',   label: 'الجدول' },
      { key: 'visits',     label: 'الزيارات' },
      { key: 'settings',   label: 'الإعدادات' }
    ],

    statusList: [],
    statusLabels: att.ATTENDANCE_STATUSES,

    /* ---------------- المعلمات ---------------- */
    teachers: [],
    query: '',
    matchedIds: null,
    showInactive: false,
    teacherModal: false,
    teacherForm: this_emptyTeacher(),
    editingId: null,

    /* ---------------- الحضور ---------------- */
    dateKey: '',
    day: null,
    roster: [],
    dayStatus: null,
    savingAttendance: false,

    /* ---------------- السجل ---------------- */
    historyFilters: { from: '', to: '', teacherId: '', status: '' },
    historyRecords: [],
    historyLoading: false,

    /* ---------------- التقارير ---------------- */
    reportTab: 'daily',
    reportRange: { from: '', to: '' },
    reportTeacherId: '',
    monthLabel: '',

    /* ---------------- الجدول ---------------- */
    scheduleTab: 'setup',
    classes: [],
    subjects: [],
    periods: [],
    assignments: [],
    classForm: { id: null, name: '', grade_level: '', section: '', capacity: '', notes: '' },
    subjectForm: { id: null, name: '', code: '', weekly_hours: '', color: '#2563eb' },
    periodForm: { id: null, name: '', start_time: '07:00', end_time: '07:45', order_index: '', is_break: false },
    assignmentForm: { id: null, teacher_id: '', subject_id: '', class_id: '', weekly_hours: '', notes: '' },
    builderClassId: '',
    builderGrid: { periods: [], days: [], grid: {} },
    cellModal: false,
    cellForm: { day: null, periodId: null, subject_id: '', teacher_id: '', room: '', notes: '' },
    cellWarning: '',
    viewMode: 'class',
    viewClassId: '',
    viewTeacherId: '',
    viewGrid: { periods: [], days: [], grid: {} },
    viewWorkload: null,

    /* ---------------- الزيارات ---------------- */
    visits: [],
    visitFilters: { teacherId: '', from: '', to: '', visitType: '' },
    visitModal: false,
    visitForm: this_emptyVisit(),

    /* ---------------- الإعدادات ---------------- */
    themeForm: { ...theme.DEFAULT_THEME_VALUES },
    fonts: theme.AVAILABLE_FONTS,
    calendarMode: 'tabular',
    umalquraSupported: false,
    systemInfo: { teachers: 0, teachersAll: 0, indexSize: 0, attendance: 0, visits: 0 },

    /* ================================================================ */
    /* التهيئة                                                          */
    /* ================================================================ */

    setBootMessage(text) {
      this.bootMessage = text;
      const el = document.getElementById('boot-message');
      if (el) el.textContent = text;
    },

    hideBoot() {
      const el = document.getElementById('boot');
      if (el) el.remove();
    },

    showBootError(message) {
      const el = document.getElementById('boot');
      if (!el) return;
      el.innerHTML =
        '<div class="boot-inner" style="max-width:420px">' +
        '<strong>تعذّر بدء التطبيق</strong>' +
        '<p class="muted"></p>' +
        '<button class="btn btn-primary" type="button">إعادة المحاولة</button></div>';
      el.querySelector('p').textContent = message;
      el.querySelector('button').addEventListener('click', () => location.reload());
    },

    async init() {
      if (window.__appInitialized) return;
      window.__appInitialized = true;

      try {
        // 1) الثيم
        this.themeForm = theme.loadTheme();
        theme.applyTheme();

        // وضع التقويم
        this.umalquraSupported = hijri.supportsUmalqura();
        const savedMode = localStorage.getItem(CALENDAR_KEY) || 'tabular';
        this.calendarMode = hijri.setCalendarMode(savedMode);

        // 2) قاعدة البيانات
        this.setBootMessage('جارٍ تجهيز قاعدة البيانات…');
        await db.initDB();

        // 3) قائمة الحالات
        this.statusList = att.getStatusList();

        // 4) المعلمات
        this.setBootMessage('جارٍ تحميل البيانات…');
        await this.loadTeachers();

        // 5) حضور اليوم
        this.dateKey = att.todayHijriKey();
        await this.loadDay();

        // 6) نطاق الشهر للتقارير
        const range = att.getCurrentHijriMonthRange();
        this.reportRange = { from: range.from, to: range.to };
        this.monthLabel = range.label;
        this.historyFilters.from = range.from;
        this.historyFilters.to = range.to;
        this.visitFilters.from = range.from;
        this.visitFilters.to = range.to;

        // بيانات الجدول
        await this.loadScheduleSetup();

        this.booted = true;
        this.hideBoot();

        // 7) Service Worker
        this.registerServiceWorker();
      } catch (err) {
        console.error('[app] فشل التهيئة', err);
        this.bootError = String(err && err.message || err);
        this.showBootError(this.bootError);
      }
    },

    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      if (location.protocol === 'file:') return;
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('[sw] لم يُسجَّل:', err.message);
      });
    },

    /* ================================================================ */
    /* أدوات مساعدة                                                     */
    /* ================================================================ */

    toast(message, type = 'success') {
      const id = ++this.toastId;
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 3600);
    },

    statusLabel(key) { return att.getStatusLabel(key); },
    statusColor(key) { return att.getStatusColor(key); },
    needsTime(key) { return att.needsTime(key); },
    dayName(d) { return sched.getDayName(d); },

    formatDateKey(key) {
      if (!key) return '—';
      return hijri.formatHijriShort(hijri.keyToHijri(key));
    },

    teacherName(id) {
      const t = this.teachers.find(x => x.id === Number(id));
      return t ? t.name : '—';
    },

    /* ================================================================ */
    /* المعلمات                                                         */
    /* ================================================================ */

    async loadTeachers() {
      this.teachers = await db.getAllTeachers(true);
      search.initSearch(this.teachers);
      this.liveSearch();
      await this.refreshSystemInfo();
    },

    liveSearch() {
      const q = this.query.trim();
      this.matchedIds = q ? new Set(search.searchTeachers(q)) : null;
    },

    clearSearch() {
      this.query = '';
      this.matchedIds = null;
    },

    get visibleTeachers() {
      return this.teachers.filter(t => {
        if (!this.showInactive && !t.is_active) return false;
        if (this.matchedIds && !this.matchedIds.has(t.id)) return false;
        return true;
      });
    },

    get activeTeachers() {
      return this.teachers.filter(t => t.is_active);
    },

    openAddTeacher() {
      this.editingId = null;
      this.teacherForm = this_emptyTeacher();
      this.teacherModal = true;
    },

    openEditTeacher(t) {
      this.editingId = t.id;
      this.teacherForm = {
        name: t.name || '',
        specialty: t.specialty || '',
        phone: t.phone || '',
        email: t.email || '',
        hire_date: t.hire_date || '',
        notes: t.notes || '',
        is_active: t.is_active !== false
      };
      this.teacherModal = true;
    },

    async saveTeacher() {
      const name = (this.teacherForm.name || '').trim();
      if (!name) { this.toast('اكتبي اسم المعلمة أولاً', 'error'); return; }

      try {
        const payload = { ...this.teacherForm, name };
        const saved = this.editingId
          ? await db.updateTeacher(this.editingId, payload)
          : await db.addTeacher(payload);

        await this.loadTeachers();
        if (saved) search.addToIndex(saved);

        if (this.tab === 'attendance') await this.loadDay();

        this.teacherModal = false;
        this.toast(this.editingId ? 'حُفظت التعديلات' : 'أُضيفت المعلمة');
        this.editingId = null;
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      }
    },

    async toggleActive(t) {
      try {
        await db.toggleTeacherActive(t.id, !t.is_active);
        await this.loadTeachers();
        this.toast(t.is_active ? 'عُطّلت المعلمة' : 'فُعّلت المعلمة');
      } catch (err) {
        this.toast('تعذّر التغيير: ' + err.message, 'error');
      }
    },

    async removeTeacher(t) {
      if (!confirm(`سيُحذف سجل ${t.name} وكل حضورها وزياراتها نهائياً. متابعة؟`)) return;
      try {
        await db.deleteTeacher(t.id);
        search.removeFromIndex(t.id);
        await this.loadTeachers();
        await this.loadDay();
        this.toast('حُذفت المعلمة');
      } catch (err) {
        this.toast('تعذّر الحذف: ' + err.message, 'error');
      }
    },

    /* ---------------- الاستيراد والتصدير ---------------- */

    triggerImport() {
      this.$refs.importFile.click();
    },

    async onImportFile(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;

      importer.handleFileUpload(file, async (result) => {
        if (!result.teachers.length) {
          this.toast(result.errors[0] || 'لم يُعثر على أي معلمة في الملف', 'error');
          return;
        }
        try {
          const res = await db.bulkInsertTeachers(result.teachers);
          await this.loadTeachers();
          const parts = [];
          if (res.inserted) parts.push(`أُضيفت ${res.inserted}`);
          if (res.updated) parts.push(`حُدّثت ${res.updated}`);
          if (res.skipped) parts.push(`تُخطّيت ${res.skipped}`);
          this.toast(parts.join('، ') || 'لم يتغيّر شيء');
          if (result.errors.length) {
            console.warn('[import] تحذيرات:', result.errors);
            this.toast(`${result.errors.length} سطراً به مشكلة — التفاصيل في Console`, 'warning');
          }
        } catch (err) {
          this.toast('تعذّر الاستيراد: ' + err.message, 'error');
        }
      });
    },

    downloadTemplate() {
      importer.downloadCSVTemplate();
      this.toast('نُزّل قالب CSV');
    },

    exportTeachersJSON() {
      exporter.exportJSON(this.teachers, 'المعلمات.json');
      this.toast('صُدّر ملف JSON');
    },

    exportTeachersCSV() {
      exporter.exportCSV(this.teachers, [
        { key: 'name', label: 'الاسم' },
        { key: 'specialty', label: 'التخصص' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'email', label: 'البريد' },
        { key: 'hire_date', label: 'تاريخ التعيين' },
        { key: 'notes', label: 'ملاحظات' },
        { label: 'الحالة', value: r => (r.is_active ? 'نشطة' : 'معطّلة') }
      ], 'المعلمات.csv');
      this.toast('صُدّر ملف CSV');
    },

    /* ================================================================ */
    /* الحضور                                                           */
    /* ================================================================ */

    async loadDay() {
      const data = await att.getDayRoster(this.dateKey);
      this.roster = data.roster;
      this.dayStatus = data.dayStatus;
      this.day = data.day;
    },

    async goDay(delta) {
      const next = att.navigateDay(this.dateKey, delta);
      this.dateKey = next.key;
      await this.loadDay();
    },

    async goToday() {
      this.dateKey = att.todayHijriKey();
      await this.loadDay();
    },

    get dayStats() {
      return att.summarizeStats(this.roster);
    },

    get presenceRate() {
      return att.calculatePresenceRate(this.dayStats);
    },

    setStatus(row, key) {
      row.status = row.status === key ? null : key;
      if (!att.needsTime(row.status)) row.time = '';
    },

    markRestPresent() {
      let n = 0;
      for (const row of this.roster) {
        if (!row.status) { row.status = 'present'; n++; }
      }
      this.toast(n ? `عُيّنت ${n} معلمة كحاضرة` : 'كل المعلمات لهن حالة بالفعل', n ? 'success' : 'warning');
    },

    clearRosterUI() {
      for (const row of this.roster) { row.status = null; row.time = ''; row.note = ''; }
      this.toast('مُسحت الواجهة — لم يُحذف شيء من قاعدة البيانات', 'warning');
    },

    async saveAttendance() {
      const check = att.validateRoster(this.roster);

      if (!check.ok) {
        const names = check.missingTime.map(r => r.name).join('، ');
        this.toast(`أدخلي الوقت لـ: ${names}`, 'error');
        return;
      }

      if (check.missingStatus.length) {
        const ok = confirm(
          `${check.missingStatus.length} معلمة بدون حالة ولن تُحفظ لها سجلات. متابعة الحفظ؟`
        );
        if (!ok) return;
      }

      this.savingAttendance = true;
      try {
        const res = await att.saveDayAttendance(this.dateKey, this.roster);
        await this.loadDay();
        this.toast(`حُفظ ${res.saved} سجلاً${res.removed ? ` وحُذف ${res.removed}` : ''}`);
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      } finally {
        this.savingAttendance = false;
      }
    },

    async deleteDayRecords() {
      if (!confirm(`سيُحذف كل حضور يوم ${this.day.hijriShort} نهائياً. متابعة؟`)) return;
      try {
        await db.deleteAttendanceByDate(this.dateKey);
        await this.loadDay();
        this.toast('حُذفت سجلات اليوم');
      } catch (err) {
        this.toast('تعذّر الحذف: ' + err.message, 'error');
      }
    },

    async toggleHoliday() {
      const isHoliday = !!(this.dayStatus && this.dayStatus.is_holiday);
      try {
        if (isHoliday) {
          await db.removeHoliday(this.dateKey);
          this.toast('أُلغيت الإجازة');
        } else {
          const name = prompt('اسم الإجازة أو المناسبة:', 'إجازة');
          if (name === null) return;
          await db.setHoliday(this.dateKey, this.day.gregorianISO, true, name.trim() || 'إجازة');
          this.toast('سُجّل اليوم كإجازة');
        }
        await this.loadDay();
      } catch (err) {
        this.toast('تعذّر التغيير: ' + err.message, 'error');
      }
    },

    /* ================================================================ */
    /* السجل                                                            */
    /* ================================================================ */

    async loadHistory() {
      this.historyLoading = true;
      try {
        this.historyRecords = await db.getAttendanceHistory({
          from: this.historyFilters.from || null,
          to: this.historyFilters.to || null,
          teacherId: this.historyFilters.teacherId ? Number(this.historyFilters.teacherId) : null,
          status: this.historyFilters.status || null,
          limit: 1000
        });
        this.toast(`عُثر على ${this.historyRecords.length} سجلاً`);
      } catch (err) {
        this.toast('تعذّر البحث: ' + err.message, 'error');
      } finally {
        this.historyLoading = false;
      }
    },

    clearHistoryFilters() {
      const range = att.getCurrentHijriMonthRange();
      this.historyFilters = { from: range.from, to: range.to, teacherId: '', status: '' };
      this.historyRecords = [];
    },

    async printHistory() {
      const html = await att.generateHistoryReport({
        from: this.historyFilters.from || null,
        to: this.historyFilters.to || null,
        teacherId: this.historyFilters.teacherId ? Number(this.historyFilters.teacherId) : null,
        status: this.historyFilters.status || null,
        teacherName: this.historyFilters.teacherId ? this.teacherName(this.historyFilters.teacherId) : null,
        limit: 1000
      });
      att.generatePDFReport(html, 'تقرير السجل');
    },

    /* ================================================================ */
    /* التقارير                                                         */
    /* ================================================================ */

    async printDaily() {
      const html = await att.generateDailyReport(this.dateKey);
      att.generatePDFReport(html, 'التقرير اليومي');
    },

    async printTeacherReport() {
      if (!this.reportTeacherId) { this.toast('اختاري المعلمة أولاً', 'error'); return; }
      const html = await att.generateTeacherReport(
        Number(this.reportTeacherId), this.reportRange.from, this.reportRange.to
      );
      att.generatePDFReport(html, 'تقرير معلمة');
    },

    async printGeneral() {
      const html = await att.generateGeneralReport(this.reportRange.from, this.reportRange.to);
      att.generatePDFReport(html, 'التقرير العام');
    },

    async printHolidays() {
      const html = await att.generateHolidaysReport(this.reportRange.from, this.reportRange.to);
      att.generatePDFReport(html, 'تقرير الإجازات');
    },

    resetReportRange() {
      const range = att.getCurrentHijriMonthRange();
      this.reportRange = { from: range.from, to: range.to };
      this.toast(`عُيّنت الفترة إلى ${range.label}`);
    },

    /* ================================================================ */
    /* الجدول: الإعداد                                                  */
    /* ================================================================ */

    async loadScheduleSetup() {
      [this.classes, this.subjects, this.periods, this.assignments] = await Promise.all([
        db.getAllClasses(true),
        db.getAllSubjects(true),
        db.getAllPeriods(),
        db.getAllAssignments({})
      ]);
    },

    get teachingPeriods() {
      return this.periods.filter(p => !p.is_break);
    },

    /* --- الصفوف --- */

    editClass(c) {
      this.classForm = {
        id: c.id, name: c.name || '', grade_level: c.grade_level ?? '',
        section: c.section || '', capacity: c.capacity ?? '', notes: c.notes || ''
      };
    },

    resetClassForm() {
      this.classForm = { id: null, name: '', grade_level: '', section: '', capacity: '', notes: '' };
    },

    async saveClass() {
      if (!this.classForm.name.trim()) { this.toast('اكتبي اسم الصف', 'error'); return; }
      try {
        if (this.classForm.id) await db.updateClass(this.classForm.id, this.classForm);
        else await db.addClass(this.classForm);
        await this.loadScheduleSetup();
        this.resetClassForm();
        this.toast('حُفظ الصف');
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      }
    },

    async removeClass(c) {
      if (!confirm(`سيُحذف الصف «${c.name}» وجدوله وتكليفاته. متابعة؟`)) return;
      await db.deleteClass(c.id);
      if (String(this.builderClassId) === String(c.id)) this.builderClassId = '';
      await this.loadScheduleSetup();
      this.toast('حُذف الصف');
    },

    /* --- المواد --- */

    editSubject(s) {
      this.subjectForm = {
        id: s.id, name: s.name || '', code: s.code || '',
        weekly_hours: s.weekly_hours ?? '', color: s.color || '#2563eb'
      };
    },

    resetSubjectForm() {
      this.subjectForm = { id: null, name: '', code: '', weekly_hours: '', color: '#2563eb' };
    },

    async saveSubject() {
      if (!this.subjectForm.name.trim()) { this.toast('اكتبي اسم المادة', 'error'); return; }
      try {
        if (this.subjectForm.id) await db.updateSubject(this.subjectForm.id, this.subjectForm);
        else await db.addSubject(this.subjectForm);
        await this.loadScheduleSetup();
        this.resetSubjectForm();
        this.toast('حُفظت المادة');
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      }
    },

    async removeSubject(s) {
      if (!confirm(`سيُحذف «${s.name}» من كل الجداول والتكليفات. متابعة؟`)) return;
      await db.deleteSubject(s.id);
      await this.loadScheduleSetup();
      this.toast('حُذفت المادة');
    },

    /* --- الحصص --- */

    editPeriod(p) {
      this.periodForm = {
        id: p.id, name: p.name || '', start_time: p.start_time || '',
        end_time: p.end_time || '', order_index: p.order_index ?? '', is_break: !!p.is_break
      };
    },

    resetPeriodForm() {
      const next = this.periods.length
        ? Math.max(...this.periods.map(p => p.order_index || 0)) + 1 : 1;
      this.periodForm = {
        id: null, name: '', start_time: '07:00', end_time: '07:45',
        order_index: next, is_break: false
      };
    },

    async savePeriod() {
      const f = this.periodForm;
      if (!f.name.trim() || !f.start_time || !f.end_time) {
        this.toast('اكتبي اسم الحصة ووقت البداية والنهاية', 'error');
        return;
      }
      try {
        if (f.id) await db.updatePeriod(f.id, f);
        else await db.addPeriod(f);
        await this.loadScheduleSetup();
        this.resetPeriodForm();
        await this.refreshBuilder();
        this.toast('حُفظت الحصة');
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      }
    },

    async removePeriod(p) {
      if (!confirm(`سيُحذف «${p.name}» من كل الجداول. متابعة؟`)) return;
      await db.deletePeriod(p.id);
      await this.loadScheduleSetup();
      await this.refreshBuilder();
      this.toast('حُذفت الحصة');
    },

    /* --- التكليفات --- */

    editAssignment(a) {
      this.assignmentForm = {
        id: a.id, teacher_id: a.teacher_id, subject_id: a.subject_id,
        class_id: a.class_id, weekly_hours: a.weekly_hours ?? '', notes: a.notes || ''
      };
    },

    resetAssignmentForm() {
      this.assignmentForm = { id: null, teacher_id: '', subject_id: '', class_id: '', weekly_hours: '', notes: '' };
    },

    async saveAssignment() {
      const f = this.assignmentForm;
      if (!f.teacher_id || !f.subject_id || !f.class_id) {
        this.toast('اختاري المعلمة والمادة والصف', 'error');
        return;
      }
      try {
        const payload = {
          teacher_id: Number(f.teacher_id),
          subject_id: Number(f.subject_id),
          class_id: Number(f.class_id),
          weekly_hours: f.weekly_hours,
          notes: f.notes
        };
        if (f.id) await db.updateAssignment(f.id, payload);
        else await db.addAssignment(payload);
        await this.loadScheduleSetup();
        this.resetAssignmentForm();
        this.toast('حُفظ التكليف');
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      }
    },

    async removeAssignment(a) {
      if (!confirm('سيُحذف هذا التكليف. متابعة؟')) return;
      await db.deleteAssignment(a.id);
      await this.loadScheduleSetup();
      this.toast('حُذف التكليف');
    },

    /* ================================================================ */
    /* الجدول: البناء                                                   */
    /* ================================================================ */

    async refreshBuilder() {
      if (!this.builderClassId) {
        this.builderGrid = { periods: this.periods, days: sched.getWorkingDays(), grid: {} };
        return;
      }
      this.builderGrid = await sched.getScheduleGrid(Number(this.builderClassId));
    },

    cellAt(periodId, day) {
      const row = this.builderGrid.grid[periodId];
      return row ? row[day] : null;
    },

    openCell(periodId, day) {
      if (!this.builderClassId) { this.toast('اختاري الصف أولاً', 'error'); return; }
      const cell = this.cellAt(periodId, day);
      this.cellForm = {
        day,
        periodId,
        subject_id: cell && cell.subject_id ? cell.subject_id : '',
        teacher_id: cell && cell.teacher_id ? cell.teacher_id : '',
        room: cell && cell.room ? cell.room : '',
        notes: cell && cell.notes ? cell.notes : ''
      };
      this.cellWarning = '';
      this.cellModal = true;
    },

    async saveCell() {
      const f = this.cellForm;
      const classId = Number(this.builderClassId);

      try {
        const check = await sched.validateScheduleCell(
          classId, f.day, f.periodId,
          f.teacher_id ? Number(f.teacher_id) : null,
          f.subject_id ? Number(f.subject_id) : null
        );

        if (!check.ok) { this.cellWarning = check.blocking; return; }

        await db.setScheduleCell(classId, f.day, f.periodId, {
          subject_id: f.subject_id ? Number(f.subject_id) : null,
          teacher_id: f.teacher_id ? Number(f.teacher_id) : null,
          room: f.room,
          notes: f.notes
        });

        await this.refreshBuilder();
        this.cellModal = false;

        if (check.warnings.length) this.toast(check.warnings[0], 'warning');
        else this.toast('حُفظت الحصة في الجدول');
      } catch (err) {
        this.cellWarning = 'تعذّر الحفظ: ' + err.message;
      }
    },

    async clearCell() {
      const f = this.cellForm;
      await db.deleteScheduleCell(Number(this.builderClassId), f.day, f.periodId);
      await this.refreshBuilder();
      this.cellModal = false;
      this.toast('أُفرغت الخلية');
    },

    /* ================================================================ */
    /* الجدول: العرض                                                    */
    /* ================================================================ */

    async refreshView() {
      this.viewWorkload = null;

      if (this.viewMode === 'class') {
        if (!this.viewClassId) { this.viewGrid = { periods: [], days: [], grid: {} }; return; }
        this.viewGrid = await sched.getScheduleGrid(Number(this.viewClassId));
      } else {
        if (!this.viewTeacherId) { this.viewGrid = { periods: [], days: [], grid: {} }; return; }
        this.viewGrid = await sched.getTeacherGrid(Number(this.viewTeacherId));
        this.viewWorkload = await sched.getTeacherWorkload(Number(this.viewTeacherId));
      }
    },

    viewCellAt(periodId, day) {
      const row = this.viewGrid.grid[periodId];
      return row ? row[day] : null;
    },

    async printSchedule() {
      if (this.viewMode === 'class') {
        if (!this.viewClassId) { this.toast('اختاري الصف أولاً', 'error'); return; }
        await sched.generateClassSchedulePDF(Number(this.viewClassId));
      } else {
        if (!this.viewTeacherId) { this.toast('اختاري المعلمة أولاً', 'error'); return; }
        await sched.generateTeacherSchedulePDF(Number(this.viewTeacherId));
      }
    },

    /* ================================================================ */
    /* الزيارات                                                         */
    /* ================================================================ */

    async loadVisits() {
      this.visits = await db.getAllVisits({
        teacherId: this.visitFilters.teacherId ? Number(this.visitFilters.teacherId) : null,
        from: this.visitFilters.from || null,
        to: this.visitFilters.to || null,
        visitType: this.visitFilters.visitType || null
      });
    },

    clearVisitFilters() {
      const range = att.getCurrentHijriMonthRange();
      this.visitFilters = { teacherId: '', from: range.from, to: range.to, visitType: '' };
      this.loadVisits();
    },

    openAddVisit() {
      this.visitForm = this_emptyVisit();
      this.visitForm.date_hijri = this.dateKey || att.todayHijriKey();
      this.visitModal = true;
    },

    openEditVisit(v) {
      this.visitForm = {
        id: v.id,
        teacher_id: v.teacher_id || '',
        date_hijri: v.date_hijri || '',
        period_id: v.period_id || '',
        class_id: v.class_id || '',
        visit_type: v.visit_type || 'مجدولة',
        score: v.score ?? '',
        strengths: v.strengths || '',
        improvements: v.improvements || '',
        recommendations: v.recommendations || '',
        notes: v.notes || ''
      };
      this.visitModal = true;
    },

    async saveVisit() {
      const f = this.visitForm;
      if (!f.teacher_id) { this.toast('اختاري المعلمة', 'error'); return; }
      if (!/^\d{3,4}-\d{2}-\d{2}$/.test(f.date_hijri)) {
        this.toast('التاريخ الهجري يُكتب هكذا: 1447-09-15', 'error');
        return;
      }
      if (f.score !== '' && (Number(f.score) < 0 || Number(f.score) > 100)) {
        this.toast('الدرجة بين 0 و 100', 'error');
        return;
      }

      try {
        const day = att.describeDay(f.date_hijri);
        const payload = {
          teacher_id: Number(f.teacher_id),
          date_hijri: f.date_hijri,
          date_gregorian: day.gregorianISO,
          period_id: f.period_id || null,
          class_id: f.class_id || null,
          visit_type: f.visit_type || null,
          score: f.score === '' ? null : Number(f.score),
          strengths: f.strengths,
          improvements: f.improvements,
          recommendations: f.recommendations,
          notes: f.notes
        };

        if (f.id) await db.updateVisit(f.id, payload);
        else await db.addVisit(payload);

        await this.loadVisits();
        this.visitModal = false;
        this.toast(f.id ? 'حُفظت التعديلات' : 'سُجّلت الزيارة');
      } catch (err) {
        this.toast('تعذّر الحفظ: ' + err.message, 'error');
      }
    },

    async removeVisit(v) {
      if (!confirm('سيُحذف سجل هذه الزيارة نهائياً. متابعة؟')) return;
      await db.deleteVisit(v.id);
      await this.loadVisits();
      this.toast('حُذفت الزيارة');
    },

    async printVisits() {
      const html = await att.generateVisitsReport({
        teacherId: this.visitFilters.teacherId ? Number(this.visitFilters.teacherId) : null,
        from: this.visitFilters.from || null,
        to: this.visitFilters.to || null,
        visitType: this.visitFilters.visitType || null
      });
      att.generatePDFReport(html, 'تقرير الزيارات');
    },

    /* ================================================================ */
    /* الإعدادات                                                        */
    /* ================================================================ */

    previewTheme() {
      theme.applyTheme(this.themeForm);
    },

    saveThemeSettings() {
      theme.saveTheme(this.themeForm);
      this.toast('حُفظ المظهر');
    },

    resetThemeSettings() {
      this.themeForm = theme.resetTheme();
      this.toast('استُعيد المظهر الافتراضي');
    },

    exportThemeSettings() {
      theme.exportTheme();
      this.toast('صُدّر ملف المظهر');
    },

    triggerThemeImport() { this.$refs.themeFile.click(); },

    async onThemeFile(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        this.themeForm = await theme.importTheme(file);
        this.toast('طُبّق المظهر المستورد');
      } catch (err) {
        this.toast(err.message, 'error');
      }
    },

    changeCalendarMode() {
      const applied = hijri.setCalendarMode(this.calendarMode);
      this.calendarMode = applied;
      try { localStorage.setItem(CALENDAR_KEY, applied); } catch (e) { /* تجاهل */ }
      this.dateKey = att.todayHijriKey();
      this.loadDay();
      const range = att.getCurrentHijriMonthRange();
      this.reportRange = { from: range.from, to: range.to };
      this.monthLabel = range.label;
      this.toast(applied === 'umalqura' ? 'التقويم الآن: أم القرى' : 'التقويم الآن: حسابي');
    },

    async backupAll() {
      try {
        const data = await db.exportAllData();
        const stamp = hijri.hijriToKey(hijri.getCurrentHijri());
        exporter.exportJSON(data, `نسخة-احتياطية-${stamp}.json`);
        this.toast('صُدّرت النسخة الاحتياطية');
      } catch (err) {
        this.toast('تعذّر التصدير: ' + err.message, 'error');
      }
    },

    triggerRestore() { this.$refs.backupFile.click(); },

    async onBackupFile(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;

      if (!confirm('ستحل النسخة الاحتياطية محل كل البيانات الحالية. متابعة؟')) return;

      try {
        const payload = await exporter.readJSONFile(file);
        if (!payload || !payload.tables) throw new Error('الملف ليس نسخة احتياطية صالحة');
        await db.importAllData(payload);
        await this.loadTeachers();
        await this.loadScheduleSetup();
        await this.loadDay();
        this.toast('استُعيدت النسخة الاحتياطية');
      } catch (err) {
        this.toast('تعذّرت الاستعادة: ' + err.message, 'error');
      }
    },

    async refreshSystemInfo() {
      try {
        const history = await db.getAttendanceHistory({ limit: 5000 });
        const visits = await db.getAllVisits({});
        this.systemInfo = {
          teachers: this.teachers.filter(t => t.is_active).length,
          teachersAll: this.teachers.length,
          indexSize: search.indexSize(),
          attendance: history.length,
          visits: visits.length
        };
      } catch (e) {
        /* تجاهل */
      }
    },

    /* ================================================================ */
    /* تبديل التبويبات                                                  */
    /* ================================================================ */

    async switchTab(key) {
      this.tab = key;
      if (key === 'attendance') await this.loadDay();
      if (key === 'history' && !this.historyRecords.length) await this.loadHistory();
      if (key === 'visits') await this.loadVisits();
      if (key === 'schedule') { await this.loadScheduleSetup(); await this.refreshBuilder(); }
      if (key === 'settings') await this.refreshSystemInfo();
    }
  };
}

/* نماذج فارغة — خارج الكائن حتى لا تتأثر بسياق this */
function this_emptyTeacher() {
  return { name: '', specialty: '', phone: '', email: '', hire_date: '', notes: '', is_active: true };
}

function this_emptyVisit() {
  return {
    id: null, teacher_id: '', date_hijri: '', period_id: '', class_id: '',
    visit_type: 'مجدولة', score: '', strengths: '', improvements: '',
    recommendations: '', notes: ''
  };
}

window.app = app;

/* تحميل Alpine يدوياً بعد جاهزية DOM — يمنع الشاشة البيضاء وازدواج init */
Promise.all([
  import('https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js'),
  new Promise(resolve => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    } else resolve();
  })
]).then(([mod]) => {
  window.Alpine = mod.default;
  window.Alpine.start();
}).catch(err => {
  console.error('[alpine] فشل التحميل', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.innerHTML =
      '<div class="boot-inner"><strong>تعذّر تحميل التطبيق</strong>' +
      '<p class="muted">تأكدي من الاتصال بالإنترنت عند أول تشغيل فقط، ثم أعيدي تحميل الصفحة.</p></div>';
  }
});
