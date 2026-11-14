/*
  Генерація файлів календаря .ics (RFC 5545) — для Календаря iPhone, Google, Outlook.
  Без нагадувань (VALARM): лише події.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ics = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dateValue(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  /* Місцевий («плаваючий») час без часового поясу */
  function localDateTimeValue(d) {
    return dateValue(d) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function escapeText(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function utf8Len(ch) {
    var c = ch.codePointAt(0);
    if (c < 0x80) return 1;
    if (c < 0x800) return 2;
    if (c < 0x10000) return 3;
    return 4;
  }

  /* Перенесення рядків довших за 75 байт (UTF-8), не розриваючи символи */
  function fold(line) {
    var out = [];
    var current = '';
    var bytes = 0;
    var limit = 75;
    for (var _i = 0, chars = Array.from(line); _i < chars.length; _i++) {
      var ch = chars[_i];
      var len = utf8Len(ch);
      if (bytes + len > limit) {
        out.push(current);
        current = ' ';
        bytes = 1;
      }
      current += ch;
      bytes += len;
    }
    out.push(current);
    return out.join('\r\n');
  }

  /*
    events: [{
      uid, title, description, location,
      allDay: true,  date: Date               — цілоденна подія
      allDay: false, start: Date, end: Date   — подія з часом
    }]
  */
  function build(events, now) {
    var stamp = utcStamp(now || new Date());
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MASONOV TATTOO//Pamyatka//UK',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    events.forEach(function (ev) {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + ev.uid);
      lines.push('DTSTAMP:' + stamp);
      if (ev.allDay) {
        var next = new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate() + 1);
        lines.push('DTSTART;VALUE=DATE:' + dateValue(ev.date));
        lines.push('DTEND;VALUE=DATE:' + dateValue(next));
        lines.push('TRANSP:TRANSPARENT');
      } else {
        lines.push('DTSTART:' + localDateTimeValue(ev.start));
        lines.push('DTEND:' + localDateTimeValue(ev.end));
      }
      lines.push('SUMMARY:' + escapeText(ev.title));
      if (ev.description) lines.push('DESCRIPTION:' + escapeText(ev.description));
      if (ev.location) lines.push('LOCATION:' + escapeText(ev.location));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  return { build: build, fold: fold, escapeText: escapeText, dateValue: dateValue };
});
