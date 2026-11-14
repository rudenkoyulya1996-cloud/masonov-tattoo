/*
  Чиста логіка без роботи з DOM: дати, трекер загоєння, відлік, параметри посилання.
  Працює і в браузері (window.Logic), і в Node для тестів (require).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  var FILM_MIN = 3;
  var FILM_MAX = 5;
  var FILM_DEFAULT = 4;
  var CREAM_DAYS = 14;
  var CLASSIC_TOTAL = 14;

  var MONTHS_GENITIVE = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
  ];

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* 'YYYY-MM-DD' → Date (місцева північ) або null */
  function parseDate(str) {
    if (typeof str !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
  }

  /* 'YYYY-MM-DDTHH:MM' → Date або null */
  function parseDateTime(str) {
    if (typeof str !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(str.trim());
    if (!m) return null;
    var base = parseDate(m[1] + '-' + m[2] + '-' + m[3]);
    var h = +m[4], mi = +m[5];
    if (!base || h > 23 || mi > 59) return null;
    base.setHours(h, mi, 0, 0);
    return base;
  }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function toDateTimeStr(d) {
    return toDateStr(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  /* Кількість календарних днів від a до b (стійко до переходу на літній час) */
  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
  }

  /* Українська множина: plural(5, ['день', 'дні', 'днів']) → 'днів' */
  function plural(n, forms) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }

  var DAYS = ['день', 'дні', 'днів'];
  var HOURS = ['година', 'години', 'годин'];
  var MINUTES = ['хвилина', 'хвилини', 'хвилин'];

  function countWord(n, forms) {
    return n + ' ' + plural(n, forms);
  }

  /* Date → '14 листопада' */
  function formatDate(d) {
    return d.getDate() + ' ' + MONTHS_GENITIVE[d.getMonth()];
  }

  function formatTime(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* Мілісекунди → [{n: 2, word: 'дні'}, {n: 5, word: 'годин'}] */
  function durationParts(ms) {
    var totalMin = Math.max(0, Math.ceil(ms / 60000));
    var days = Math.floor(totalMin / 1440);
    var hours = Math.floor((totalMin % 1440) / 60);
    var mins = totalMin % 60;
    var parts = [];
    function add(n, forms) { parts.push({ n: n, word: plural(n, forms) }); }
    if (days > 0) {
      add(days, DAYS);
      if (hours > 0) add(hours, HOURS);
    } else if (hours > 0) {
      add(hours, HOURS);
      if (mins > 0) add(mins, MINUTES);
    } else {
      add(Math.max(mins, 1), MINUTES);
    }
    return parts;
  }

  /* Мілісекунди → '2 дні 5 годин' / '3 години 10 хвилин' / '12 хвилин' */
  function formatDuration(ms) {
    return durationParts(ms).map(function (p) { return p.n + ' ' + p.word; }).join(' ');
  }

  function clampFilmDays(v) {
    var n = parseInt(v, 10);
    if (isNaN(n) || n < FILM_MIN || n > FILM_MAX) return FILM_DEFAULT;
    return n;
  }

  function normalizeMode(v) {
    return v === 'film' ? 'film' : 'classic';
  }

  function totalDays(mode, filmDays) {
    return normalizeMode(mode) === 'film' ? clampFilmDays(filmDays) + CREAM_DAYS : CLASSIC_TOTAL;
  }

  /*
    Стан трекера загоєння. День сеансу = День 1.
    → { state: 'empty' }
    → { state: 'future', start, daysUntil }
    → { state: 'active', start, day, total, phase, progress, creamDay? }
    → { state: 'done', start, total }
  */
  function computeHealing(dateStr, mode, filmDays, today) {
    var start = parseDate(dateStr);
    if (!start) return { state: 'empty' };
    mode = normalizeMode(mode);
    filmDays = clampFilmDays(filmDays);
    var now = today || new Date();
    var day = daysBetween(start, now) + 1;
    var total = totalDays(mode, filmDays);

    if (day < 1) return { state: 'future', start: start, daysUntil: 1 - day, total: total };
    if (day > total) return { state: 'done', start: start, total: total };

    var phase;
    var result = { state: 'active', start: start, day: day, total: total };
    if (mode === 'classic') {
      if (day === 1) phase = 'classicFirst';
      else if (day <= 4) phase = 'classicCream2x';
      else phase = 'classicCream';
    } else if (day < filmDays) {
      phase = 'filmWear';
    } else if (day === filmDays) {
      phase = 'filmRemove';
    } else {
      phase = 'filmCream';
      result.creamDay = day - filmDays;
    }
    result.phase = phase;
    result.progress = day / total;
    return result;
  }

  /* Дати подій для календаря загоєння */
  function healingEvents(dateStr, mode, filmDays) {
    var start = parseDate(dateStr);
    if (!start) return [];
    mode = normalizeMode(mode);
    filmDays = clampFilmDays(filmDays);
    if (mode === 'classic') {
      return [
        { kind: 'classicDay4', date: addDays(start, 3) },
        { kind: 'healingDone', date: addDays(start, CLASSIC_TOTAL - 1) },
      ];
    }
    return [
      { kind: 'filmRemove', date: addDays(start, filmDays - 1) },
      { kind: 'healingDone', date: addDays(start, filmDays + CREAM_DAYS - 1) },
    ];
  }

  /* Відлік до сеансу */
  function sessionCountdown(sessionStr, now) {
    var at = parseDateTime(sessionStr);
    if (!at) return { state: 'empty' };
    var ms = at - (now || new Date());
    if (ms <= 0) return { state: 'past', at: at, ms: ms };
    return { state: 'upcoming', at: at, ms: ms };
  }

  /* ?tab=after&date=2026-11-20&mode=film&filmDays=4&session=2026-11-20T14:00 */
  function parseParams(search) {
    var out = {};
    var query = (search || '').replace(/^\?/, '');
    if (!query) return out;
    var pairs = query.split('&');
    var raw = {};
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      var idx = pairs[i].indexOf('=');
      var k = idx < 0 ? pairs[i] : pairs[i].slice(0, idx);
      var v = idx < 0 ? '' : pairs[i].slice(idx + 1);
      try {
        raw[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch (e) { /* пошкоджений параметр — пропускаємо */ }
    }
    if (raw.tab === 'before' || raw.tab === 'after') out.tab = raw.tab;
    if (parseDate(raw.date)) out.healDate = raw.date.trim();
    if (raw.mode === 'film' || raw.mode === 'classic') out.mode = raw.mode;
    if (raw.filmDays !== undefined) {
      var n = parseInt(raw.filmDays, 10);
      if (!isNaN(n) && n >= FILM_MIN && n <= FILM_MAX) out.filmDays = n;
    }
    var s = parseDateTime(raw.session);
    if (s) out.session = toDateTimeStr(s);
    return out;
  }

  /* Короткий стабільний хеш рядка (для id галочок) */
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  return {
    FILM_MIN: FILM_MIN,
    FILM_MAX: FILM_MAX,
    FILM_DEFAULT: FILM_DEFAULT,
    pad: pad,
    parseDate: parseDate,
    parseDateTime: parseDateTime,
    toDateStr: toDateStr,
    toDateTimeStr: toDateTimeStr,
    addDays: addDays,
    daysBetween: daysBetween,
    plural: plural,
    countWord: countWord,
    DAYS: DAYS,
    formatDate: formatDate,
    formatTime: formatTime,
    formatDuration: formatDuration,
    durationParts: durationParts,
    clampFilmDays: clampFilmDays,
    normalizeMode: normalizeMode,
    totalDays: totalDays,
    computeHealing: computeHealing,
    healingEvents: healingEvents,
    sessionCountdown: sessionCountdown,
    parseParams: parseParams,
    hash: hash,
  };
});
