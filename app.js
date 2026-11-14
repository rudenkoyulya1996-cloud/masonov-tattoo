/*
  Інтерфейс пам'ятки MASONOV TATTOO.
  Тексти — у content.js, логіка дат — у logic.js, календар — у ics.js.
*/
(function () {
  'use strict';

  var C = window.CONTENT;
  var L = window.Logic;
  var store = window.store;
  var doc = document;

  /* ---------- Стан ---------- */

  var STATE_KEY = 'state-v1';
  var saved = store.get(STATE_KEY, {}) || {};
  var params = L.parseParams(window.location.search);

  var state = {
    tab: params.tab || (saved.tab === 'before' || saved.tab === 'after' ? saved.tab : 'after'),
    mode: params.mode || L.normalizeMode(saved.mode),
    filmDays: params.filmDays || L.clampFilmDays(saved.filmDays),
    healDate: params.healDate || (L.parseDate(saved.healDate) ? saved.healDate : ''),
    session: params.session || (L.parseDateTime(saved.session) ? saved.session : ''),
    checks: saved.checks && typeof saved.checks === 'object' ? saved.checks : {},
  };

  function save() {
    store.set(STATE_KEY, state);
    syncUrl();
  }

  /* URL завжди відображає поточні дані — посилання можна скопіювати
     й відкрити в іншому браузері або додати на головний екран. */
  function syncUrl() {
    try {
      var q = ['tab=' + state.tab];
      if (state.tab === 'after' || state.healDate) {
        if (state.healDate) q.push('date=' + state.healDate);
        q.push('mode=' + state.mode);
        if (state.mode === 'film') q.push('filmDays=' + state.filmDays);
      }
      if (state.session) q.push('session=' + state.session);
      var url = window.location.pathname + '?' + q.join('&') + window.location.hash;
      window.history.replaceState(null, '', url);
    } catch (e) { /* не критично */ }
  }

  /* ---------- Допоміжне ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* **жирне** і ==плашка== */
  function md(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/==(.+?)==/g, '<mark class="hl">$1</mark>');
  }

  function fmt(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? vars[k] : m;
    });
  }

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  var ICON = {
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="v" d="M12 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  var ua = navigator.userAgent || '';
  var isIOS = !/Android/i.test(ua) &&
    (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  var isInApp = /Instagram|FBAN|FBAV|FB_IAB|Telegram|Line\/|WebView|; wv\)/i.test(ua);
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  var toastTimer = null;
  function toast(text) {
    var el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('is-visible');
    void el.offsetWidth;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 300);
    }, 2600);
  }

  /* ---------- Шаблони ---------- */

  function panelHead(title) {
    return '' +
      '<div class="panel-head">' +
        '<p class="panel-head__date">' + esc(fmt(C.common.todayEyebrow, { date: L.formatDate(new Date()) })) + '</p>' +
        '<h1 class="panel-head__title">' + esc(title) + '</h1>' +
      '</div>';
  }

  var accId = 0;
  function accordion(title, bodyHtml, opts) {
    opts = opts || {};
    var id = 'acc-' + (++accId);
    return '' +
      '<div class="acc card' + (opts.open ? ' is-open' : '') + '"' + (opts.key ? ' data-acc="' + opts.key + '"' : '') + '>' +
        '<h3 class="acc__h">' +
          '<button type="button" class="acc__btn" id="' + id + '-btn" aria-expanded="' + (opts.open ? 'true' : 'false') + '" aria-controls="' + id + '">' +
            '<span>' + esc(title) + '</span><span class="acc__icon" aria-hidden="true">' + ICON.plus + '</span>' +
          '</button>' +
        '</h3>' +
        '<div class="acc__panel" id="' + id + '" role="region" aria-labelledby="' + id + '-btn">' +
          '<div class="acc__inner"><div class="acc__body">' + bodyHtml + '</div></div>' +
        '</div>' +
      '</div>';
  }

  function paragraphs(items) {
    return items.map(function (t) { return '<p>' + md(t) + '</p>'; }).join('');
  }

  function bulletList(items) {
    return '<ul class="bullets">' + items.map(function (t) { return '<li>' + md(t) + '</li>'; }).join('') + '</ul>';
  }

  function checklist(listId, title, items) {
    var rows = items.map(function (text) {
      var id = listId + ':' + L.hash(text);
      return '' +
        '<li><label class="check">' +
          '<input type="checkbox" data-check="' + esc(id) + '"' + (state.checks[id] ? ' checked' : '') + '>' +
          '<span class="check__text">' + md(text) + '</span>' +
          '<span class="check__box" aria-hidden="true">' + ICON.check + '</span>' +
        '</label></li>';
    }).join('');
    return '' +
      '<section class="card checklist" data-list="' + esc(listId) + '">' +
        '<div class="card__head">' +
          '<h2 class="card__title">' + esc(title) + '</h2>' +
          '<span class="pill pill--soft counter" aria-live="polite"></span>' +
        '</div>' +
        '<ul class="checks">' + rows + '</ul>' +
      '</section>';
  }

  function arrowBtn(tag, cls, label, attrs) {
    return '<' + tag + ' class="btn ' + cls + '" ' + attrs + '>' +
      '<span class="btn__label">' + esc(label) + '</span>' +
      '<span class="btn__icon">' + ICON.arrow + '</span>' +
      '</' + tag + '>';
  }

  function actionsBlock(calendarLabel, calendarAction) {
    return '' +
      '<div class="actions">' +
        arrowBtn('button', 'btn--accent', calendarLabel, 'type="button" data-action="' + calendarAction + '"') +
        (isInApp ? '' +
          '<div class="inapp">' +
            '<p>' + esc(C.common.inAppBrowserHint) + '</p>' +
            '<button type="button" class="btn btn--light btn--small" data-action="copy-link">' + esc(C.common.copyLink) + '</button>' +
          '</div>' : '') +
        arrowBtn('a', 'btn--dark', C.common.writeUs, 'href="' + esc(C.brand.directLink) + '" target="_blank" rel="noopener"') +
      '</div>';
  }

  function segments(value, total) {
    var html = '';
    for (var i = 0; i < total; i++) {
      html += '<span class="seg" data-on="' + (i < value ? '1' : '0') + '" style="transition-delay:' + (i * 35) + 'ms"></span>';
    }
    return '<div class="segs" role="progressbar" aria-label="Прогрес загоєння" aria-valuemin="0" aria-valuemax="' + total +
      '" aria-valuenow="' + value + '">' + html + '</div>';
  }

  function animateSegments(ctx) {
    var segs = $all('.seg', ctx);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        segs.forEach(function (s) { if (s.getAttribute('data-on') === '1') s.classList.add('is-on'); });
      });
    });
  }

  /* ---------- Вкладка «Загоюю тату» ---------- */

  function renderAfter() {
    var A = C.after;
    var S = A.sections;

    var filmBody = '' +
      '<p>' + md(S.film.intro) + '</p>' +
      bulletList(S.film.list) +
      '<p class="outro">' + md(S.film.outro) + '</p>';

    var importantBody = paragraphs(S.important.items) +
      '<p class="accent">' + md(S.important.accent) + '</p>';

    var forbiddenBody = '<ol class="numbered">' + S.forbidden.items.map(function (t) {
      return '<li>' + md(t) + '</li>';
    }).join('') + '</ol>';

    $('#panel-after').innerHTML = '' +
      panelHead(C.tabs.after) +

      '<div class="block">' +
        '<p class="label" id="modeLabel">' + esc(A.modeLabel) + '</p>' +
        '<div class="segmented" role="radiogroup" aria-labelledby="modeLabel">' +
          '<button type="button" role="radio" data-mode="classic">' + esc(A.modes.classic) + '</button>' +
          '<button type="button" role="radio" data-mode="film">' + esc(A.modes.film) + '</button>' +
          '<span class="segmented__thumb" aria-hidden="true"></span>' +
        '</div>' +
      '</div>' +

      '<section class="card card--dark tracker">' +
        '<div class="card__head">' +
          '<h2 class="card__title">' + esc(A.tracker.title) + '</h2>' +
          '<span class="pill pill--accent" id="modePill"></span>' +
        '</div>' +
        '<label class="field">' +
          '<span class="field__label">' + esc(A.tracker.dateLabel) + '</span>' +
          '<input type="date" id="healDate" class="field__input" value="' + esc(state.healDate) + '">' +
        '</label>' +
        '<div id="trackerOut" class="tracker__out" aria-live="polite"></div>' +
      '</section>' +

      '<div id="todayOut"></div>' +

      '<div class="accs">' +
        accordion(S.classic.title, paragraphs(S.classic.items), { key: 'classic', open: true }) +
        accordion(S.film.title, filmBody, { key: 'film', open: true }) +
        accordion(S.important.title, importantBody, { key: 'important' }) +
        accordion(S.forbidden.title, forbiddenBody, { key: 'forbidden' }) +
      '</div>' +

      checklist('shopping', A.shopping.title, A.shopping.items) +
      checklist('shoppingFilm', A.shopping.title, A.shopping.filmItems || []) +

      actionsBlock(A.calendar.button, 'calendar-healing');
  }

  function renderTracker() {
    var T = C.after.tracker;
    var out = $('#trackerOut');
    var todayOut = $('#todayOut');
    var r = L.computeHealing(state.healDate, state.mode, state.filmDays, new Date());
    var html = '';
    var today = '';

    if (r.state === 'empty') {
      html = '<p class="dim">' + esc(T.empty) + '</p>';
    } else if (r.state === 'future') {
      html = '' +
        '<p class="dim">' + esc(fmt(T.sessionOn, { date: L.formatDate(r.start) })) + '</p>' +
        '<p class="big">' + esc(T.futureTitle) + '</p>' +
        '<p class="dim">' + esc(r.daysUntil === 1 ? T.futureTomorrow : fmt(T.futureText, { days: L.countWord(r.daysUntil, L.DAYS) })) + '</p>' +
        arrowBtn('button', 'btn--light btn--small', T.futureButton, 'type="button" data-goto="before"');
    } else if (r.state === 'done') {
      html = '' +
        '<p class="dim">' + esc(fmt(T.sessionOn, { date: L.formatDate(r.start) })) + '</p>' +
        '<p class="day">' + esc(T.doneTitle) + '</p>' +
        segments(r.total, r.total);
      today = '' +
        '<section class="card card--accent today">' +
          '<p>' + md(T.doneText) + '</p>' +
          arrowBtn('a', 'btn--dark btn--small', T.doneButton, 'href="' + esc(C.brand.directLink) + '" target="_blank" rel="noopener"') +
        '</section>';
    } else {
      html = '' +
        '<p class="dim">' + esc(fmt(T.sessionOn, { date: L.formatDate(r.start) })) + '</p>' +
        '<p class="day">' + esc(fmt(T.dayOf, { day: r.day, total: r.total })) + '</p>' +
        segments(r.day, r.total) +
        (r.creamDay ? '<p class="dim small">' + esc(fmt(T.creamDay, { day: r.creamDay })) + '</p>' : '');
      today = '' +
        '<section class="card card--accent today">' +
          '<h2 class="card__title">' + esc(T.today) + '</h2>' +
          paragraphs(T.phases[r.phase] || []) +
        '</section>';
    }

    out.innerHTML = html;
    todayOut.innerHTML = today;
    animateSegments(out);
  }

  function updateMode() {
    $all('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.mode;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    $('.segmented').setAttribute('data-active', state.mode);
    $('#modePill').textContent = C.after.modesShort[state.mode];
    var film = state.mode === 'film';
    $('[data-acc="classic"]').hidden = film;
    $('[data-acc="important"]').hidden = film;
    $('[data-acc="film"]').hidden = !film;
    $('[data-list="shopping"]').hidden = film;
    $('[data-list="shoppingFilm"]').hidden = !film;
  }

  /* ---------- Вкладка «Готуюсь до сеансу» ---------- */

  function renderBefore() {
    var B = C.before;
    $('#panel-before').innerHTML = '' +
      panelHead(C.tabs.before) +

      '<section class="card card--dark session">' +
        '<div class="card__head">' +
          '<h2 class="card__title">' + esc(B.session.title) + '</h2>' +
        '</div>' +
        '<label class="field">' +
          '<span class="field__label">' + esc(B.session.label) + '</span>' +
          '<input type="datetime-local" id="sessionAt" class="field__input" value="' + esc(state.session) + '">' +
        '</label>' +
        '<div id="countdownOut" class="countdown"></div>' +
      '</section>' +

      B.checklists.map(function (list) { return checklist(list.id, list.title, list.items); }).join('') +

      '<section class="card card--soft">' +
        '<h2 class="card__title">' + esc(B.forbidden.title) + '</h2>' +
        paragraphs(B.forbidden.items) +
      '</section>' +

      actionsBlock(B.calendar.button, 'calendar-session');
  }

  function renderCountdown() {
    var S = C.before.session;
    var out = $('#countdownOut');
    var r = L.sessionCountdown(state.session, new Date());
    if (r.state === 'empty') {
      out.innerHTML = '<p class="dim">' + esc(S.empty) + '</p>';
      return;
    }
    var when = esc(fmt(S.sessionOn, { date: L.formatDate(r.at), time: L.formatTime(r.at) }));
    if (r.state === 'past') {
      out.innerHTML = '' +
        '<p class="dim">' + when + '</p>' +
        '<p class="big">' + esc(S.past) + '</p>' +
        arrowBtn('button', 'btn--light btn--small', S.pastButton, 'type="button" data-action="to-healing"');
      return;
    }
    var body;
    if (r.ms < 60000) {
      body = '<p class="big">' + esc(S.soon) + '</p>';
    } else {
      body = '<div class="tiles" aria-label="' + esc(S.countdown + ' ' + L.formatDuration(r.ms)) + '">' +
        L.durationParts(r.ms).map(function (p) {
          return '<div class="tile" aria-hidden="true"><span class="tile__n">' + p.n + '</span><span class="tile__w">' + esc(p.word) + '</span></div>';
        }).join('') +
        '</div>';
    }
    out.innerHTML = '' +
      '<p class="dim">' + esc(S.countdown) + '</p>' +
      body +
      '<p class="pill pill--accent pill--when">' + when + '</p>';
  }

  /* ---------- Чек-листи ---------- */

  function updateCounters() {
    $all('.checklist').forEach(function (list) {
      var boxes = $all('input[type="checkbox"]', list);
      var done = boxes.filter(function (b) { return b.checked; }).length;
      $('.counter', list).textContent = fmt(C.common.progressOf, { done: done, total: boxes.length });
      list.classList.toggle('is-complete', boxes.length > 0 && done === boxes.length);
    });
  }

  /* ---------- Вкладки ---------- */

  function setTab(tab, focus) {
    state.tab = tab;
    $all('[role="tab"]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $('.tabbar').setAttribute('data-active', tab);
    $('#panel-before').hidden = tab !== 'before';
    $('#panel-after').hidden = tab !== 'after';
    if (tab === 'after') renderTracker();
    else renderCountdown();
    save();
  }

  /* ---------- Календар ---------- */

  function downloadIcs(text, fileName) {
    if (isIOS) {
      // Safari на iPhone одразу пропонує «Додати до Календаря»
      window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
      return;
    }
    try {
      var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = fileName;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    } catch (e) {
      window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
    }
  }

  function calendarHealing() {
    var cal = C.after.calendar;
    var events = L.healingEvents(state.healDate, state.mode, state.filmDays);
    if (!events.length) { toast(C.common.calendarNeedsDate); return; }
    var ics = window.Ics.build(events.map(function (ev) {
      var text = cal.events[ev.kind];
      return {
        uid: 'heal-' + ev.kind + '-' + window.Ics.dateValue(ev.date) + '@masonov-tattoo',
        allDay: true,
        date: ev.date,
        title: text.title,
        description: text.description,
      };
    }));
    downloadIcs(ics, cal.fileName);
  }

  function calendarSession() {
    var cal = C.before.calendar;
    var at = L.parseDateTime(state.session);
    if (!at) { toast(C.common.calendarNeedsDate); return; }
    var end = new Date(at.getTime() + (cal.durationHours || 3) * 3600000);
    var ics = window.Ics.build([{
      uid: 'session-' + L.toDateTimeStr(at).replace(/\D/g, '') + '@masonov-tattoo',
      allDay: false,
      start: at,
      end: end,
      title: cal.title,
      description: cal.description,
      location: cal.location,
    }]);
    downloadIcs(ics, cal.fileName);
  }

  function copyLink() {
    var url = window.location.href;
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.select();
      try { doc.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove();
      toast(C.common.linkCopied);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast(C.common.linkCopied); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- Події ---------- */

  function bind() {
    doc.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t) return;

      if (t.matches('[role="tab"]')) {
        if (t.getAttribute('data-tab') !== state.tab) {
          setTab(t.getAttribute('data-tab'));
          window.scrollTo(0, 0);
        }
        return;
      }

      if (t.matches('[data-mode]')) {
        state.mode = t.getAttribute('data-mode');
        updateMode(); renderTracker(); save();
        return;
      }

      if (t.matches('.acc__btn')) {
        var acc = t.closest('.acc');
        var open = !acc.classList.contains('is-open');
        acc.classList.toggle('is-open', open);
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }

      if (t.matches('[data-goto]')) {
        setTab(t.getAttribute('data-goto'));
        window.scrollTo(0, 0);
        return;
      }

      var action = t.getAttribute('data-action');
      if (action === 'calendar-healing') calendarHealing();
      else if (action === 'calendar-session') calendarSession();
      else if (action === 'copy-link') copyLink();
      else if (action === 'to-healing') {
        if (!state.healDate) {
          var at = L.parseDateTime(state.session);
          if (at) {
            state.healDate = L.toDateStr(at);
            $('#healDate').value = state.healDate;
          }
        }
        setTab('after');
        window.scrollTo(0, 0);
      } else if (action === 'close-ios-hint') {
        hideIosHint();
      }
    });

    // Стрілки на вкладках і перемикачах (доступність з клавіатури)
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var t = e.target;
      var group = t.closest('[role="tablist"], [role="radiogroup"]');
      if (!group) return;
      var items = $all('[role="tab"], [role="radio"]', group);
      var i = items.indexOf(t);
      if (i < 0) return;
      e.preventDefault();
      var next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
      next.focus();
      next.click();
    });

    function onHealDate(e) {
      var v = e.target.value;
      var next = L.parseDate(v) ? v : '';
      if (next === state.healDate) return;
      state.healDate = next;
      renderTracker(); save();
    }
    function onSession(e) {
      var d = L.parseDateTime(e.target.value);
      var next = d ? L.toDateTimeStr(d) : '';
      if (next === state.session) return;
      state.session = next;
      renderCountdown(); save();
    }

    doc.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'healDate') onHealDate(e);
      else if (t.id === 'sessionAt') onSession(e);
      else if (t.matches('[data-check]')) {
        var id = t.getAttribute('data-check');
        if (t.checked) state.checks[id] = true;
        else delete state.checks[id];
        updateCounters(); save();
      }
    });
    doc.addEventListener('input', function (e) {
      if (e.target.id === 'healDate') onHealDate(e);
      else if (e.target.id === 'sessionAt') onSession(e);
    });

    // Оновлення відліку і переходу на новий день
    setInterval(function () {
      if (state.tab === 'before') renderCountdown();
    }, 30000);
    var lastDay = L.toDateStr(new Date());
    function refreshIfNewDay() {
      var today = L.toDateStr(new Date());
      if (today !== lastDay) {
        lastDay = today;
        renderTracker();
        $all('.panel-head__date').forEach(function (el) {
          el.textContent = fmt(C.common.todayEyebrow, { date: L.formatDate(new Date()) });
        });
      }
      renderCountdown();
    }
    setInterval(refreshIfNewDay, 60000);
    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) refreshIfNewDay();
    });
  }

  /* ---------- Підказка для iPhone ---------- */

  function maybeShowIosHint() {
    var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(ua);
    if (!isIOS || !isSafari || isInApp || isStandalone) return;
    if (store.get('ios-hint-shown', false)) return;
    var H = C.common.iosHint;
    var el = $('#iosHint');
    el.innerHTML = '' +
      '<div class="ios-hint__text">' +
        '<p class="ios-hint__title">' + esc(H.title) + '</p>' +
        '<p>' + md(H.text) + '</p>' +
      '</div>' +
      '<button type="button" class="ios-hint__close" data-action="close-ios-hint" aria-label="' + esc(H.close) + '"><span aria-hidden="true"></span></button>';
    setTimeout(function () {
      el.hidden = false;
      requestAnimationFrame(function () { el.classList.add('is-visible'); });
      store.set('ios-hint-shown', true);
    }, 1800);
  }

  function hideIosHint() {
    var el = $('#iosHint');
    el.classList.remove('is-visible');
    setTimeout(function () { el.hidden = true; }, 300);
  }

  /* ---------- Старт ---------- */

  function init() {
    doc.documentElement.classList.add('js');
    $('#brandName').textContent = C.brand.name;
    $('#brandSub').textContent = C.brand.subtitle || '';
    $('#headerDm').href = C.brand.directLink;
    $all('.signature').forEach(function (el) { el.textContent = C.brand.signature; });
    $('#tab-before').textContent = C.tabs.before;
    $('#tab-after').textContent = C.tabs.after;

    if (C.settings && C.settings.backgroundImage) {
      var bg = $('.bg');
      bg.style.backgroundImage = 'url("' + String(C.settings.backgroundImage).replace(/"/g, '%22') + '")';
      bg.classList.add('has-image');
    }

    renderBefore();
    renderAfter();
    updateMode();
    updateCounters();
    bind();
    setTab(state.tab);
    maybeShowIosHint();

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', function () {
        try {
          navigator.serviceWorker.register('sw.js').catch(function () { /* не критично */ });
        } catch (e) { /* не критично */ }
      });
    }
  }

  init();
})();
