/*
  Service worker: сторінка відкривається навіть без інтернету.
  Файли завжди беруться з мережі, а кеш — лише запасний варіант офлайн,
  тож після редагування текстів нічого міняти тут не потрібно.
*/
var VERSION = 'masonov-v1';
var FONT_CACHE = 'masonov-fonts';

var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'content.js',
  'storage.js',
  'logic.js',
  'ics.js',
  'app.js',
  'manifest.json',
  'icons/logo.png',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== VERSION && k !== FONT_CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Шрифти Google: віддаємо з кешу, оновлюємо у фоні
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var network = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
          return cached || network;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Сторінка: спершу мережа (щоб бачити свіжий текст), без мережі — кеш
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put('./', copy); });
        return res;
      }).catch(function () {
        return caches.match('./').then(function (r) { return r || caches.match('index.html'); });
      })
    );
    return;
  }

  // Решта файлів теж спершу з мережі — тож зміни в content.js
  // одразу видно клієнтам. Без інтернету — з кешу.
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true });
    })
  );
});
