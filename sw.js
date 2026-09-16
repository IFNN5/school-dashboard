// sw.js — يخزّن ملفات اللوحة والمكتبات الخارجية ليعمل التطبيق بلا إنترنت
// عند أي تعديل على الملفات: غيّري رقم CACHE_NAME و RUNTIME_CACHE.

const CACHE_NAME = 'school-dashboard-v2';
const RUNTIME_CACHE = 'school-dashboard-runtime-v2';

// ملفات اللوحة (محلية) — لا بد من نجاحها كلها
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/hijri.js',
  './js/attendance.js',
  './js/schedule.js',
  './js/search.js',
  './js/import.js',
  './js/export.js',
  './js/theme.js',
  './icons/icon-192.png'
];

// المكتبات الخارجية — تُخزّن أثناء التثبيت حتى يعمل التطبيق بلا إنترنت من المرة الثانية.
// ملاحظة: أسماء ملفات chunk مرتبطة بإصدار PGlite 0.2.17 المثبّت في js/db.js.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/index.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/chunk-A7RFOIQ7.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/chunk-EADU5A67.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/chunk-WGR4JCLS.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/chunk-STOZMFXW.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/chunk-BTBUZ646.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/postgres.wasm',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/postgres.data',
  'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/es/index.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js'
];

// كل عنوان على حدة: فشل أحدها (انقطاع الشبكة) لا يُفشل التثبيت كله
async function precacheCdn() {
  const cache = await caches.open(RUNTIME_CACHE);
  await Promise.all(CDN_ASSETS.map(async url => {
    try {
      const existing = await cache.match(url);
      if (existing) return;
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (res && (res.status === 200 || res.type === 'opaque')) await cache.put(url, res.clone());
    } catch (e) { /* بلا إنترنت أثناء التثبيت: ستُخزَّن لاحقاً عند أول طلب ناجح لها */ }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS_TO_CACHE);
    await precacheCdn();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function handleRequest(request, url) {
  const cached = await caches.match(request, { ignoreSearch: url.origin !== self.location.origin });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    const cacheable = response && (response.status === 200 || response.type === 'opaque');
    if (cacheable) {
      const copy = response.clone();
      const target = url.origin === self.location.origin ? CACHE_NAME : RUNTIME_CACHE;
      caches.open(target).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (e) {
    // بلا إنترنت وبلا نسخة مخزّنة
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('', { status: 504, statusText: 'غير متصل' });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith(handleRequest(request, url));
});
