/* Запуск: node tests/tracker.test.js */
'use strict';
var assert = require('assert');
var L = require('../logic.js');
var Ics = require('../ics.js');

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

var SESSION = '2026-11-20';
function on(dateStr, hour) {
  var d = L.parseDate(dateStr);
  d.setHours(hour === undefined ? 12 : hour, 0, 0, 0);
  return d;
}
function heal(mode, filmDays, todayStr, hour) {
  return L.computeHealing(SESSION, mode, filmDays, on(todayStr, hour));
}

console.log('Класичне загоєння');
test('порожня дата → empty', function () {
  assert.strictEqual(L.computeHealing('', 'classic', 4, new Date()).state, 'empty');
  assert.strictEqual(L.computeHealing(null, 'classic', 4, new Date()).state, 'empty');
  assert.strictEqual(L.computeHealing('2026-02-30', 'classic', 4, new Date()).state, 'empty');
});
test('дата в майбутньому → future, днів до сеансу', function () {
  var r = heal('classic', 4, '2026-11-14');
  assert.strictEqual(r.state, 'future');
  assert.strictEqual(r.daysUntil, 6);
  assert.strictEqual(heal('classic', 4, '2026-11-19').daysUntil, 1);
});
test('сьогодні = день сеансу → День 1, перші 5 годин', function () {
  var r = heal('classic', 4, '2026-11-20', 0);
  assert.deepStrictEqual([r.state, r.day, r.total, r.phase], ['active', 1, 14, 'classicFirst']);
  assert.strictEqual(heal('classic', 4, '2026-11-20', 23).day, 1);
});
test('день 2 і 4 → крем 2 рази на день', function () {
  assert.strictEqual(heal('classic', 4, '2026-11-21').phase, 'classicCream2x');
  var r = heal('classic', 4, '2026-11-23');
  assert.deepStrictEqual([r.day, r.phase], [4, 'classicCream2x']);
});
test('день 5 → крем, щоб не пересихала', function () {
  var r = heal('classic', 4, '2026-11-24');
  assert.deepStrictEqual([r.day, r.phase], [5, 'classicCream']);
});
test('день 14 → ще активно, прогрес 100%', function () {
  var r = heal('classic', 4, '2026-12-03');
  assert.deepStrictEqual([r.state, r.day, r.phase], ['active', 14, 'classicCream']);
  assert.strictEqual(r.progress, 1);
});
test('день 15 → загоєння завершено', function () {
  assert.strictEqual(heal('classic', 4, '2026-12-04').state, 'done');
});

console.log('Плівка');
test('плівка 3 дні: дні 1–2 носити, 3 — зняти, 4 — крем 1/14, 17 — останній, 18 — done', function () {
  assert.strictEqual(heal('film', 3, '2026-11-20').phase, 'filmWear');
  assert.strictEqual(heal('film', 3, '2026-11-21').phase, 'filmWear');
  var d3 = heal('film', 3, '2026-11-22');
  assert.deepStrictEqual([d3.day, d3.total, d3.phase], [3, 17, 'filmRemove']);
  var d4 = heal('film', 3, '2026-11-23');
  assert.deepStrictEqual([d4.phase, d4.creamDay], ['filmCream', 1]);
  var d17 = heal('film', 3, '2026-12-06');
  assert.deepStrictEqual([d17.state, d17.day, d17.creamDay], ['active', 17, 14]);
  assert.strictEqual(heal('film', 3, '2026-12-07').state, 'done');
});
test('плівка 5 днів: день 5 — зняти, день 6 — крем, 19 — останній, 20 — done', function () {
  assert.strictEqual(heal('film', 5, '2026-11-23').phase, 'filmWear');
  var d5 = heal('film', 5, '2026-11-24');
  assert.deepStrictEqual([d5.day, d5.total, d5.phase], [5, 19, 'filmRemove']);
  assert.strictEqual(heal('film', 5, '2026-11-25').phase, 'filmCream');
  assert.strictEqual(heal('film', 5, '2026-12-08').state, 'active');
  assert.strictEqual(heal('film', 5, '2026-12-09').state, 'done');
});
test('плівка за замовчуванням і некоректні значення → 4 дні', function () {
  assert.strictEqual(heal('film', undefined, '2026-11-20').total, 18);
  assert.strictEqual(heal('film', 9, '2026-11-20').total, 18);
  assert.strictEqual(heal('film', 'abc', '2026-11-20').total, 18);
});
test('невідомий режим → класика', function () {
  assert.strictEqual(heal('whatever', 4, '2026-11-20').total, 14);
});
test('перехід на зимовий час не збиває лічильник днів', function () {
  // В Україні перехід — остання неділя жовтня
  var r = L.computeHealing('2026-10-20', 'classic', 4, on('2026-10-30', 1));
  assert.strictEqual(r.day, 11);
});

console.log('Події календаря');
test('класика: кінець 4-го дня і 14-й день', function () {
  var ev = L.healingEvents(SESSION, 'classic', 4);
  assert.deepStrictEqual(ev.map(function (e) { return e.kind + ' ' + L.toDateStr(e.date); }),
    ['classicDay4 2026-11-23', 'healingDone 2026-12-03']);
});
test('плівка 4: зняття 23.11 і кінець крему 07.12', function () {
  var ev = L.healingEvents(SESSION, 'film', 4);
  assert.deepStrictEqual(ev.map(function (e) { return e.kind + ' ' + L.toDateStr(e.date); }),
    ['filmRemove 2026-11-23', 'healingDone 2026-12-07']);
});
test('остання подія збігається з останнім активним днем трекера', function () {
  [['classic', 4], ['film', 3], ['film', 4], ['film', 5]].forEach(function (c) {
    var last = L.healingEvents(SESSION, c[0], c[1])[1].date;
    var r = L.computeHealing(SESSION, c[0], c[1], last);
    assert.strictEqual(r.day, r.total, c.join(' '));
  });
});
test('порожня дата → немає подій', function () {
  assert.deepStrictEqual(L.healingEvents('', 'classic', 4), []);
});

console.log('Параметри посилання');
test('повний набір параметрів для загоєння', function () {
  assert.deepStrictEqual(L.parseParams('?tab=after&date=2026-11-20&mode=film&filmDays=4'),
    { tab: 'after', healDate: '2026-11-20', mode: 'film', filmDays: 4 });
});
test('сеанс', function () {
  assert.deepStrictEqual(L.parseParams('?tab=before&session=2026-11-20T14:00'),
    { tab: 'before', session: '2026-11-20T14:00' });
  assert.deepStrictEqual(L.parseParams('?session=2026-11-20T14%3A00'), { session: '2026-11-20T14:00' });
});
test('сміття ігнорується', function () {
  assert.deepStrictEqual(L.parseParams('?tab=x&date=2026-13-01&mode=foo&filmDays=7&session=abc&%E0%A4%A=1'), {});
  assert.deepStrictEqual(L.parseParams(''), {});
});

console.log('Telegram startapp');
test('загоєння: класика і плівка', function () {
  assert.deepStrictEqual(L.parseStartParam('after_20261120_classic'),
    { tab: 'after', healDate: '2026-11-20', mode: 'classic' });
  assert.deepStrictEqual(L.parseStartParam('after_20261120_film4'),
    { tab: 'after', healDate: '2026-11-20', mode: 'film', filmDays: 4 });
  assert.deepStrictEqual(L.parseStartParam('20261120_film3'),
    { tab: 'after', healDate: '2026-11-20', mode: 'film', filmDays: 3 });
});
test('сеанс', function () {
  assert.deepStrictEqual(L.parseStartParam('before_202611201400'),
    { tab: 'before', session: '2026-11-20T14:00' });
  assert.deepStrictEqual(L.parseStartParam('202611201400'),
    { tab: 'before', session: '2026-11-20T14:00' });
});
test('сміття і межі', function () {
  assert.deepStrictEqual(L.parseStartParam('after_20261320_film9'), { tab: 'after', mode: 'film' });
  assert.deepStrictEqual(L.parseStartParam(''), {});
  assert.deepStrictEqual(L.parseStartParam('hello'), {});
});
test('параметр від Telegram у посиланні сторінки', function () {
  assert.deepStrictEqual(L.parseParams('?tgWebAppStartParam=after_20261120_film5'),
    { tab: 'after', healDate: '2026-11-20', mode: 'film', filmDays: 5 });
});

console.log('Тексти');
test('дати українською', function () {
  assert.strictEqual(L.formatDate(L.parseDate('2026-11-14')), '14 листопада');
  assert.strictEqual(L.formatDate(L.parseDate('2026-03-01')), '1 березня');
});
test('відмінки', function () {
  var d = L.DAYS;
  assert.deepStrictEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25].map(function (n) { return L.plural(n, d); }),
    ['день', 'дні', 'дні', 'днів', 'днів', 'днів', 'днів', 'день', 'дні', 'днів']);
});
test('тривалість відліку', function () {
  var H = 3600000;
  assert.strictEqual(L.formatDuration(2 * 24 * H + 5 * H), '2 дні 5 годин');
  assert.strictEqual(L.formatDuration(24 * H), '1 день');
  assert.strictEqual(L.formatDuration(3 * H + 10 * 60000), '3 години 10 хвилин');
  assert.strictEqual(L.formatDuration(21 * H), '21 година');
  assert.strictEqual(L.formatDuration(12 * 60000), '12 хвилин');
});
test('відлік: майбутнє, минуле, порожнє', function () {
  var now = new Date(2026, 10, 18, 9, 0);
  var up = L.sessionCountdown('2026-11-20T14:00', now);
  assert.strictEqual(up.state, 'upcoming');
  assert.strictEqual(L.formatDuration(up.ms), '2 дні 5 годин');
  assert.strictEqual(L.sessionCountdown('2026-11-17T14:00', now).state, 'past');
  assert.strictEqual(L.sessionCountdown('', now).state, 'empty');
});

console.log('Файл .ics');
test('структура, CRLF, цілоденні події, без нагадувань', function () {
  var ev = L.healingEvents(SESSION, 'classic', 4);
  var text = Ics.build(ev.map(function (e) {
    return { uid: e.kind + '@t', allDay: true, date: e.date, title: 'Тату: кінець 4-го дня загоєння', description: 'Довгий опис, з комою; і крапкою з комою — щоб перевірити екранування та перенесення рядків у файлі календаря.' };
  }), new Date(Date.UTC(2026, 10, 14, 10, 0, 0)));
  assert.ok(/^BEGIN:VCALENDAR\r\n/.test(text));
  assert.ok(/END:VCALENDAR\r\n$/.test(text));
  assert.strictEqual(text.split('\n').filter(function (l) { return !/\r$/.test(l) && l !== ''; }).length, 0, 'усі рядки закінчуються CRLF');
  assert.ok(text.indexOf('DTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261124') > 0);
  assert.ok(text.indexOf('DTSTART;VALUE=DATE:20261203\r\nDTEND;VALUE=DATE:20261204') > 0);
  assert.ok(text.indexOf('DTSTAMP:20261114T100000Z') > 0);
  assert.ok(text.indexOf('VALARM') < 0);
  assert.ok(text.indexOf('з комою\\; і') > 0 || text.replace(/\r\n /g, '').indexOf('з комою\\; і') > 0);
  text.split('\r\n').forEach(function (line) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'рядок довший за 75 байт: ' + line);
  });
});
test('подія сеансу з часом', function () {
  var at = L.parseDateTime('2026-11-20T14:00');
  var text = Ics.build([{ uid: 's@t', allDay: false, start: at, end: new Date(at.getTime() + 3 * 3600000), title: 'Сеанс' }]);
  assert.ok(text.indexOf('DTSTART:20261120T140000\r\nDTEND:20261120T170000') > 0);
});
test('перенесення не розриває кириличні літери', function () {
  var line = 'DESCRIPTION:' + 'Ї'.repeat(100);
  var folded = Ics.fold(line);
  assert.strictEqual(folded.replace(/\r\n /g, ''), line);
});

console.log('\n' + passed + ' тестів пройдено' + (process.exitCode ? ', є помилки' : ''));
