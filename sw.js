// ============================================================
//  sw.js — Service Worker
//  المسؤول عن تخزين ملفات التطبيق في الكاش للعمل بدون إنترنت
// ============================================================

// ⚠️ مهم: عند أي تعديل على ملفات التطبيق، غيّري رقم الإصدار
//         من v4 إلى v5 مثلاً، ليتم إعادة تحميل الكاش الجديد
const CACHE_NAME = 'school-dashboard-v4';

// قائمة الملفات التي سيتم تخزينها في الكاش
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/search.js',
  './js/import.js',
  './js/theme.js',
  './js/export.js',
  './js/hijri.js',
  './js/attendance.js',
  './icons/icon-192.png'
];

// ============================================================
//  حدث Install — يتم تشغيله عند أول تسجيل للـ Service Worker
//  نقوم بتخزين كل الملفات في الكاش
// ============================================================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching all assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // تفعيل فوري بدون انتظار إغلاق التبويبات
  );
});

// ============================================================
//  حدث Activate — يتم تشغيله عند تنشيط Service Worker جديد
//  نحذف الكاشات القديمة (v1، v2، v3، إلخ)
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // السيطرة على كل التبويبات المفتوحة
  );
});

// ============================================================
//  حدث Fetch — يتم تشغيله عند كل طلب من الصفحة
//  نتحقق أولاً من الكاش، وإن لم نجد الملف نجلبه من الشبكة
// ============================================================
self.addEventListener('fetch', (event) => {
  // نتجاهل الطلبات غير GET (مثل POST)
  if (event.request.method !== 'GET') return;

  // نتجاهل الطلبات من نطاقات خارجية (مثل CDN)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // إذا وُجد في الكاش، نرجعه فورًا
        if (cachedResponse) {
          return cachedResponse;
        }

        // وإلا نجلبه من الشبكة ونخزنه ديناميكيًا
        return fetch(event.request)
          .then(networkResponse => {
            // نتأكد أن الرد صالح قبل التخزين
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });

            return networkResponse;
          })
          .catch(() => {
            // في حال فشل الشبكة وعدم وجود الملف في الكاش،
            // نرجع الصفحة الرئيسية كـ fallback
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});