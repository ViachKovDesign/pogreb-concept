/* ПОГРЕБ — логика концепт-сайта. Без сборщиков. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var C = window.PogrebColor;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = function () { return reduceMQ.matches; };

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ничего */ } }
  };

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function rub(n) { return n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* =========================================================
     1. Экран 18+
     ========================================================= */
  var gate = $('#age');
  var outside = [$('.skip'), $('#header'), $('#main'), $('.footer')];
  function setInert(on) {
    outside.forEach(function (el) {
      if (!el) return;
      if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    });
  }
  function focusGate() {
    var target = root.classList.contains('age-denied') ? $('.age__denied .age__title') : $('[data-age="yes"]');
    if (target) target.focus();
  }
  if (root.classList.contains('age-pending')) {
    setInert(true);
    focusGate();
  }
  gate.addEventListener('click', function (e) {
    var b = e.target.closest('[data-age]');
    if (!b) return;
    var v = b.getAttribute('data-age');
    if (v === 'yes') {
      store.set('pogreb-age', 'yes');
      root.classList.remove('age-pending', 'age-denied');
      setInert(false);
      var h1 = $('#hero-title');
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
      h1.addEventListener('blur', function () { h1.removeAttribute('tabindex'); }, { once: true });
      if (hasGsap) window.ScrollTrigger.refresh();
    } else if (v === 'no') {
      store.set('pogreb-age', 'no:' + Date.now());
      root.classList.add('age-denied');
      focusGate();
    } else if (v === 'retry') {
      store.del('pogreb-age');
      root.classList.remove('age-denied');
      focusGate();
    }
  });

  /* =========================================================
     2. Меню и бургер
     ========================================================= */
  var burger = $('.burger');
  var nav = $('#nav');
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }
  burger.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); burger.focus(); }
  });
  window.addEventListener('resize', function () { if (window.innerWidth >= 1024) setMenu(false); });

  // подсветка текущего раздела в меню
  if ('IntersectionObserver' in window) {
    var navLinks = $$('.nav__list a');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id === 'list' ? 'list' : en.target.id;
        navLinks.forEach(function (a) {
          if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['pick', 'list', 'dinners', 'somm', 'hall', 'booking'].forEach(function (id) { var el = doc.getElementById(id); if (el) io.observe(el); });
  }

  /* =========================================================
     3. Данные вин
     ========================================================= */
  function loadData() {
    var inline = function () { return JSON.parse($('#wines-inline').textContent); };
    if (location.protocol === 'file:' || !window.fetch) return Promise.resolve(inline());
    return fetch('data/wines.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { return inline(); });
  }

  /* =========================================================
     4. Подбор вина
     ========================================================= */
  var WORDS = {
    sweet: function (v) { return v <= 2 ? 'сухое' : v <= 4 ? 'полусухое' : v <= 7 ? 'полусладкое' : 'сладкое'; },
    body: function (v) { return v <= 3 ? 'лёгкое' : v <= 6 ? 'среднее' : 'плотное'; },
    soft: function (v) { return v <= 3 ? 'свежее' : v <= 6 ? 'в балансе' : 'мягкое'; }
  };
  var BAR_LABEL = { sweet: 'сладость', body: 'плотность', soft: 'мягкость' };
  var DIMS = ['sweet', 'body', 'soft'];
  var THRESHOLD = 4.5;
  var MAXD = Math.sqrt(300);

  var form = $('#taste');
  var list = $('#cards');
  var countEl = $('#results-count');
  var emptyEl = $('#empty');
  var ranges = { sweet: $('#r-sweet'), body: $('#r-body'), soft: $('#r-soft') };
  var outputs = { sweet: $('#o-sweet'), body: $('#o-body'), soft: $('#o-soft') };
  var DEFAULTS = { sweet: 2, body: 5, soft: 5 };

  var DATA = null, wines = [], items = {}, aromaActive = null;

  function cardHTML(w, i) {
    var num = String(i + 1).padStart(2, '0');
    var bars = DIMS.map(function (d) {
      return '<div class="bar"><dt>' + BAR_LABEL[d] + '</dt><dd>' +
        '<span class="visually-hidden" data-sr="' + d + '"></span>' +
        '<span class="bar__track" aria-hidden="true"><span class="bar__fill" style="width:' + Math.max(4, w[d] * 10) + '%"></span><span class="bar__you" data-you="' + d + '"></span></span>' +
        '</dd></div>';
    }).join('');
    return '<article class="card" id="wine-' + w.id + '" tabindex="-1" aria-labelledby="wn-' + w.id + '">' +
      '<span class="card__aroma" aria-hidden="true"></span>' +
      '<div class="card__top"><span class="card__kind"><i class="dot dot--' + w.color + '" aria-hidden="true"></i>№ ' + num + ' · ' + DATA.colors[w.color] + '</span><span class="card__match" data-match></span></div>' +
      '<h3 class="card__name" id="wn-' + w.id + '">' + esc(w.name) + '</h3>' +
      '<p class="card__meta">' + esc(w.grape) + ' · ' + esc(w.region) + ' · ' + w.year + '</p>' +
      '<dl class="bars">' + bars + '</dl>' +
      '<p class="bars__legend" aria-hidden="true"><span><i class="l-wine"></i>вино</span><span><i class="l-you"></i>ваш вкус</span></p>' +
      '<p class="card__smell">пахнет: <em>' + esc(w.smell) + '</em></p>' +
      '<dl class="card__facts"><div><dt>к чему: </dt><dd>' + esc(w.pair) + '</dd></div><div><dt>подавать при </dt><dd>' + esc(w.temp) + '</dd></div></dl>' +
      '<p class="card__price"><span>бокал 125 мл <b>' + rub(w.glass) + '</b></span><span>бутылка в зале <b>' + rub(w.bottle) + '</b></span></p>' +
      '</article>';
  }

  function getTaste() {
    return { sweet: +ranges.sweet.value, body: +ranges.body.value, soft: +ranges.soft.value };
  }
  function getColors() {
    return $$('input[name="color"]:checked', form).map(function (i) { return i.value; });
  }

  function paintRanges(t) {
    DIMS.forEach(function (d) {
      var r = ranges[d], v = t[d];
      r.style.setProperty('--p', (v * 10) + '%');
      var word = WORDS[d](v);
      outputs[d].textContent = word;
      r.setAttribute('aria-valuetext', word + ', ' + v + ' из 10');
    });
  }

  var raf = 0;
  function scheduleUpdate() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; update(true); }); }

  function update(animate) {
    if (!DATA) return;
    var t = getTaste(), colors = getColors();
    paintRanges(t);
    var rows = wines.map(function (w) {
      return { w: w, d: Math.sqrt(Math.pow(w.sweet - t.sweet, 2) + Math.pow(w.body - t.body, 2) + Math.pow(w.soft - t.soft, 2)) };
    }).sort(function (a, b) { return a.d - b.d || a.w.glass - b.w.glass; });
    var visible = rows.filter(function (r) { return r.d <= THRESHOLD && (!colors.length || colors.indexOf(r.w.color) > -1); });
    var visibleIds = {};
    visible.forEach(function (r) { visibleIds[r.w.id] = true; });

    // FLIP: First
    var first = new Map();
    var doAnim = animate && !reduced() && typeof Element.prototype.animate === 'function';
    if (doAnim) {
      wines.forEach(function (w) {
        var li = items[w.id];
        if (!li.hidden) first.set(li, li.getBoundingClientRect());
        li.getAnimations().forEach(function (a) { a.cancel(); });
      });
    }
    // новый порядок
    rows.forEach(function (r) {
      var li = items[r.w.id];
      li.hidden = !visibleIds[r.w.id];
      list.appendChild(li);
      var pct = Math.round(100 * (1 - r.d / MAXD));
      li.querySelector('[data-match]').textContent = 'совпадение ' + pct + ' %';
      DIMS.forEach(function (d) {
        li.querySelector('[data-you="' + d + '"]').style.left = (t[d] * 10) + '%';
        li.querySelector('[data-sr="' + d + '"]').textContent = WORDS[d](r.w[d]) + ', ' + r.w[d] + ' из 10; ваш выбор — ' + t[d];
      });
    });
    // Last, Invert, Play
    if (doAnim) {
      visible.forEach(function (r, idx) {
        var li = items[r.w.id];
        var f = first.get(li);
        var l = li.getBoundingClientRect();
        if (f) {
          var dx = f.left - l.left, dy = f.top - l.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            li.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
              { duration: 560, easing: 'cubic-bezier(.22,.8,.24,1)' });
          }
        } else {
          li.animate([{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }],
            { duration: 420, delay: Math.min(idx, 6) * 30, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'backwards' });
        }
      });
    }
    countEl.innerHTML = visible.length
      ? 'Нашлось <b>' + visible.length + '</b> из ' + wines.length + ' — ближе всего к вашему вкусу сверху.'
      : 'Нашлось <b>0</b> из ' + wines.length + '.';
    emptyEl.hidden = visible.length > 0;
    applyAroma(aromaShown());
    renderStatus();
  }

  function resetTaste(values, keepColors) {
    DIMS.forEach(function (d) { ranges[d].value = values[d]; });
    if (!keepColors) $$('input[name="color"]', form).forEach(function (i) { i.checked = false; });
    update(true);
  }

  function initPicker(data) {
    DATA = data;
    wines = data.wines;
    var frag = doc.createDocumentFragment();
    wines.forEach(function (w, i) {
      var li = doc.createElement('li');
      li.className = 'cards__item';
      li.setAttribute('data-id', w.id);
      li.innerHTML = cardHTML(w, i);
      items[w.id] = li;
      frag.appendChild(li);
    });
    list.appendChild(frag);
    form.addEventListener('input', scheduleUpdate);
    form.addEventListener('change', scheduleUpdate);
    form.addEventListener('reset', function (e) {
      e.preventDefault();
      resetTaste(DEFAULTS);
    });
    $('#empty-reset').addEventListener('click', function () { resetTaste(DEFAULTS); ranges.sweet.focus(); });
    update(false);
    initWheel();
    if (/^#wine-/.test(location.hash)) showWine(location.hash.slice(6), false);
  }

  // Показать конкретное вино: ставим ползунки на его вкус — и оно встаёт первым
  function showWine(id, smooth) {
    var w = wines.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    resetTaste({ sweet: w.sweet, body: w.body, soft: w.soft });
    var card = doc.getElementById('wine-' + id);
    setTimeout(function () {
      card.scrollIntoView({ behavior: smooth && !reduced() ? 'smooth' : 'auto', block: 'center' });
      card.focus({ preventScroll: true });
      card.classList.remove('is-flash');
      void card.offsetWidth;
      card.classList.add('is-flash');
    }, smooth ? 60 : 0);
  }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('[data-wine-link]');
    if (!a || !DATA) return;
    e.preventDefault();
    showWine(a.getAttribute('data-wine-link'), true);
    if (history.replaceState) history.replaceState(null, '', '#wine-' + a.getAttribute('data-wine-link'));
  });

  /* =========================================================
     5. Колесо ароматов
     ========================================================= */
  var aromaPreview = null;
  function aromaShown() { return aromaPreview || aromaActive; }

  function initWheel() {
    var keys = Object.keys(DATA.aromas);
    var n = keys.length, r0 = 46, r1 = 148, rl = 100;
    var step = 360 / n;
    var pt = function (r, a) { var rad = (a - 90) * Math.PI / 180; return [r * Math.cos(rad), r * Math.sin(rad)]; };
    var f = function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); };
    var svg = '<svg viewBox="-152 -152 304 304" focusable="false">';
    keys.forEach(function (k, i) {
      var a0 = i * step - step / 2, a1 = a0 + step;
      var d = 'M' + f(pt(r0, a0)) + ' L' + f(pt(r1, a0)) + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + f(pt(r1, a1)) +
        ' L' + f(pt(r0, a1)) + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + f(pt(r0, a0)) + 'Z';
      var c = pt(rl, i * step);
      var count = wines.filter(function (w) { return w.aromas.indexOf(k) > -1; }).length;
      var words = DATA.aromas[k].split(' ');
      var lines = words.length > 2 ? [words[0], words.slice(1).join(' ')] : [DATA.aromas[k]];
      var text = lines.map(function (ln, li) {
        return '<tspan x="' + c[0].toFixed(1) + '" dy="' + (li === 0 ? (lines.length > 1 ? -2 : 4.5) : 15) + '">' + esc(ln) + '</tspan>';
      }).join('');
      svg += '<g class="wheel__sector" role="button" tabindex="' + (i === 0 ? 0 : -1) + '" aria-pressed="false" data-aroma="' + k + '" aria-label="' +
        esc(DATA.aromas[k]) + ': ' + count + ' ' + plural(count, 'вино', 'вина', 'вин') + '">' +
        '<path d="' + d + '"/><text x="' + c[0].toFixed(1) + '" y="' + (c[1] - (lines.length > 1 ? 4 : 0)).toFixed(1) + '" text-anchor="middle">' + text + '</text></g>';
    });
    svg += '<circle class="wheel__hub" r="' + (r0 - 6) + '"/><text class="wheel__hub-text" id="wheel-hub" text-anchor="middle" y="5">аромат</text></svg>';
    var box = $('#wheel');
    box.innerHTML = svg;
    var sectors = $$('.wheel__sector', box);

    function move(i) {
      i = (i + n) % n;
      sectors.forEach(function (s, j) { s.setAttribute('tabindex', j === i ? '0' : '-1'); });
      sectors[i].focus();
    }
    sectors.forEach(function (s, i) {
      var k = s.getAttribute('data-aroma');
      s.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') setPreview(k); });
      s.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') setPreview(null); });
      s.addEventListener('click', function () { toggleAroma(k); });
      s.addEventListener('focus', function () { if (s.matches(':focus-visible')) setPreview(k); });
      s.addEventListener('blur', function () { setPreview(null); });
      s.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAroma(k); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); move(0); }
        else if (e.key === 'End') { e.preventDefault(); move(n - 1); }
        else if (e.key === 'Escape' && aromaActive) { e.preventDefault(); toggleAroma(aromaActive); }
      });
    });
    renderStatus();
  }
  function setPreview(k) { aromaPreview = k; applyAroma(aromaShown()); renderStatus(); }
  function toggleAroma(k) {
    aromaActive = aromaActive === k ? null : k;
    aromaPreview = null;
    $$('.wheel__sector').forEach(function (s) { s.setAttribute('aria-pressed', String(s.getAttribute('data-aroma') === aromaActive)); });
    applyAroma(aromaShown());
    renderStatus();
  }
  function applyAroma(k) {
    if (!DATA) return;
    list.classList.toggle('has-aroma', !!k);
    $$('.wheel__sector').forEach(function (s) { s.classList.toggle('is-preview', s.getAttribute('data-aroma') === aromaPreview); });
    wines.forEach(function (w) {
      var card = items[w.id].firstChild;
      var hit = !!k && w.aromas.indexOf(k) > -1;
      card.classList.toggle('is-hit', hit);
      card.querySelector('.card__aroma').textContent = hit ? DATA.aromas[k].toLowerCase() : '';
    });
    var hub = $('#wheel-hub');
    if (hub) {
      if (k) {
        var cnt = wines.filter(function (w) { return w.aromas.indexOf(k) > -1; }).length;
        hub.textContent = cnt + ' ' + plural(cnt, 'вино', 'вина', 'вин');
      } else hub.textContent = 'аромат';
    }
  }
  function renderStatus() {
    var st = $('#wheel-status');
    var k = aromaShown();
    if (!k) { st.innerHTML = ''; st.removeAttribute('data-key'); return; }
    // не перерисовываем без нужды: иначе клик по ссылке «теряется» на blur сектора
    var key = k + '|' + aromaActive + '|' + wines.filter(function (w) { return !items[w.id].hidden; }).length;
    if (st.getAttribute('data-key') === key) return;
    st.setAttribute('data-key', key);
    var hits = wines.filter(function (w) { return w.aromas.indexOf(k) > -1; });
    var visibleHits = hits.filter(function (w) { return !items[w.id].hidden; }).length;
    var links = hits.map(function (w) { return '<a href="#wine-' + w.id + '" data-wine-link="' + w.id + '">' + esc(w.name) + '</a>'; }).join(', ');
    st.innerHTML = '<b>' + esc(DATA.aromas[k]) + '</b> — ' + hits.length + ' ' + plural(hits.length, 'вино', 'вина', 'вин') +
      (visibleHits < hits.length ? ' (в подборке сейчас ' + visibleHits + ')' : '') + ': ' + links + '.' +
      (aromaActive ? ' <button type="button" class="link-btn wheel__clear" id="wheel-clear">Снять аромат</button>' : '');
    var clr = $('#wheel-clear');
    if (clr) clr.addEventListener('click', function () {
      var cur = $('.wheel__sector[data-aroma="' + aromaActive + '"]');
      toggleAroma(aromaActive);
      if (cur) cur.focus();
    });
  }

  /* =========================================================
     6. Винные ужины
     ========================================================= */
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var dinners = $$('.dinner').map(function (li) {
    var seatsEl = $('.dinner__seats', li);
    return {
      li: li,
      title: $('.dinner__title', li).textContent,
      price: $('.dinner__price', li).textContent,
      seats: +seatsEl.getAttribute('data-seats'),
      date: null
    };
  });
  function seatsText(n) { return n > 0 ? 'осталось ' + n + ' ' + plural(n, 'место', 'места', 'мест') : 'мест нет'; }
  function dateLabel(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + WD[d.getDay()] + ', 19:30'; }
  (function placeDinners() {
    // ближайшие шесть вечеров: четверги и субботы, начиная с завтрашнего дня
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 1);
    var i = 0;
    while (i < dinners.length) {
      if (d.getDay() === 4 || d.getDay() === 6) { dinners[i].date = new Date(d); i++; }
      d.setDate(d.getDate() + 1);
    }
    dinners.forEach(function (x) {
      $('.dinner__day', x.li).textContent = x.date.getDate();
      $('.dinner__month', x.li).textContent = MONTHS[x.date.getMonth()];
      $('.dinner__wd', x.li).textContent = WD[x.date.getDay()] + ', 19:30';
      renderSeats(x);
    });
  })();
  function renderSeats(x) {
    var s = $('.dinner__seats', x.li), b = $('[data-signup]', x.li);
    s.textContent = seatsText(x.seats);
    s.classList.toggle('is-low', x.seats > 0 && x.seats <= 3);
    b.disabled = x.seats <= 0;
    b.textContent = x.seats > 0 ? 'Записаться' : 'Мест нет';
    b.setAttribute('aria-label', (x.seats > 0 ? 'Записаться на ужин «' : 'Мест нет на ужин «') + x.title + '»');
  }

  var dlg = $('#dinner-dialog');
  var dForm = $('#dinner-form');
  var dSel = $('#d-dinner'), dGuests = $('#d-guests');
  var lastOpener = null;
  function fillDinnerSelect() {
    dSel.innerHTML = dinners.map(function (x, i) {
      return '<option value="' + i + '"' + (x.seats <= 0 ? ' disabled' : '') + '>' + esc(x.title) + ' — ' + dateLabel(x.date) + '</option>';
    }).join('');
  }
  function syncDinner() {
    var x = dinners[+dSel.value];
    var max = Math.min(4, x.seats);
    var cur = +dGuests.value || 1;
    dGuests.innerHTML = '';
    for (var i = 1; i <= Math.max(1, max); i++) dGuests.insertAdjacentHTML('beforeend', '<option value="' + i + '">' + i + '</option>');
    dGuests.value = String(Math.min(cur, Math.max(1, max)));
    $('#dd-lead').textContent = 'Сет из 5 бокалов и закусок — ' + x.price.replace(/\s/g, ' ') + ' с гостя. ' + seatsText(x.seats).replace(/^о/, 'О') + '.';
  }
  dSel.addEventListener('change', syncDinner);
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-signup]');
    if (!b) return;
    lastOpener = b;
    fillDinnerSelect();
    dSel.value = b.getAttribute('data-signup');
    syncDinner();
    dForm.hidden = false;
    $('#dinner-done').hidden = true;
    clearErrors(dForm);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { $('#d-name').focus(); }, 30);
  });
  function closeDialog() { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target.closest('[data-close]')) closeDialog();
  });
  dlg.addEventListener('close', function () { if (lastOpener) lastOpener.focus(); });

  /* =========================================================
     7. Формы: валидация и демо-подтверждение
     ========================================================= */
  function setError(input, msg) {
    var id = input.getAttribute('aria-describedby') || '';
    var errId = id.split(' ').filter(function (x) { return /-err$/.test(x); })[0];
    var err = errId ? doc.getElementById(errId) : null;
    if (msg) { input.setAttribute('aria-invalid', 'true'); if (err) { err.textContent = msg; err.hidden = false; } }
    else { input.removeAttribute('aria-invalid'); if (err) { err.textContent = ''; err.hidden = true; } }
    return !msg;
  }
  function clearErrors(f) {
    $$('[aria-invalid]', f).forEach(function (i) { i.removeAttribute('aria-invalid'); });
    $$('.field__err', f).forEach(function (e) { e.hidden = true; e.textContent = ''; });
  }
  function phoneDigits(v) {
    var d = v.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return d;
  }
  function formatPhone(v) {
    var d = phoneDigits(v);
    if (d.length !== 11) return v;
    return '+7 (' + d.slice(1, 4) + ') ' + d.slice(4, 7) + '-' + d.slice(7, 9) + '-' + d.slice(9, 11);
  }
  function checkName(input) {
    var v = input.value.trim();
    if (!v) return setError(input, 'Как к вам обращаться? Напишите имя.');
    if (v.length < 2) return setError(input, 'Имя слишком короткое — хотя бы две буквы.');
    if (!/^[A-Za-zА-Яа-яЁё\s\-']+$/.test(v)) return setError(input, 'Только буквы, пробел и дефис.');
    return setError(input, '');
  }
  function checkPhone(input) {
    var v = input.value.trim();
    if (!v) return setError(input, 'Нужен телефон, чтобы подтвердить бронь.');
    var d = phoneDigits(v);
    if (d.length !== 11 || d[0] !== '7') return setError(input, 'Проверьте номер: после +7 должно быть 10 цифр.');
    return setError(input, '');
  }
  $$('input[type="tel"]').forEach(function (i) {
    i.addEventListener('blur', function () { i.value = formatPhone(i.value); });
  });

  // --- запись на ужин
  dForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var okName = checkName($('#d-name')), okPhone = checkPhone($('#d-phone'));
    dForm.setAttribute('data-tried', '');
    if (!okName) { $('#d-name').focus(); return; }
    if (!okPhone) { $('#d-phone').focus(); return; }
    var x = dinners[+dSel.value], g = +dGuests.value;
    x.seats = Math.max(0, x.seats - g);
    renderSeats(x);
    $('#dinner-summary').textContent = '«' + x.title + '», ' + dateLabel(x.date) + '. ' + g + ' ' + plural(g, 'место', 'места', 'мест') + ' на имя ' + $('#d-name').value.trim() + '.';
    dForm.hidden = true;
    dForm.reset();
    dForm.removeAttribute('data-tried');
    var done = $('#dinner-done');
    done.hidden = false;
    done.focus();
  });
  dForm.addEventListener('input', function (e) {
    if (!dForm.hasAttribute('data-tried')) return;
    if (e.target.id === 'd-name') checkName(e.target);
    if (e.target.id === 'd-phone') checkPhone(e.target);
  });

  // --- бронь стола
  var bForm = $('#booking-form');
  var bDate = $('#b-date'), bGuests = $('#b-guests'), bName = $('#b-name'), bPhone = $('#b-phone'), bWish = $('#b-wish');
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
  bDate.min = ymd(today);
  bDate.max = ymd(maxDate);
  function parseDate(v) { var p = v.split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function syncSlots() {
    var v = bDate.value, d = v ? parseDate(v) : null;
    var now = new Date();
    $$('input[name="time"]', bForm).forEach(function (r) {
      var taken = !!v && hash(v + r.value) % 4 === 0;
      if (d && d.getTime() === today.getTime()) {
        var hm = r.value.split(':');
        var slot = new Date(); slot.setHours(+hm[0], +hm[1], 0, 0);
        if (slot - now < 60 * 60 * 1000) taken = true;
      }
      if (d && d.getDay() === 1) taken = true;
      r.disabled = taken;
      r.parentNode.title = taken ? 'Занято' : '';
      if (taken && r.checked) r.checked = false;
    });
  }
  bDate.addEventListener('change', syncSlots);
  syncSlots();
  $$('.stepper__btn', bForm).forEach(function (b) {
    b.addEventListener('click', function () {
      var v = clamp((parseInt(bGuests.value, 10) || 0) + (+b.getAttribute('data-step')), 1, 8);
      bGuests.value = v;
      if (bForm.hasAttribute('data-tried')) checkGuests();
    });
  });
  bWish.addEventListener('input', function () { $('#b-wish-count').textContent = bWish.value.length + ' / 300'; });

  function checkDate() {
    var v = bDate.value;
    if (!v) return setError(bDate, 'Выберите дату.');
    var d = parseDate(v);
    if (!d || isNaN(d)) return setError(bDate, 'Дата выглядит странно — выберите в календаре.');
    if (d < today) return setError(bDate, 'Эта дата уже прошла.');
    if (d > maxDate) return setError(bDate, 'Бронируем не дальше чем на два месяца вперёд.');
    if (d.getDay() === 1) return setError(bDate, 'По понедельникам мы закрыты — выберите другой день.');
    return setError(bDate, '');
  }
  function checkTime() {
    var picked = $('input[name="time"]:checked', bForm);
    var err = $('#b-time-err');
    var anyFree = $$('input[name="time"]', bForm).some(function (r) { return !r.disabled; });
    var msg = picked ? '' : (anyFree ? 'Выберите время.' : 'На этот день свободного времени нет — попробуйте другую дату.');
    err.textContent = msg; err.hidden = !msg;
    return !msg;
  }
  function checkGuests() {
    var v = parseInt(bGuests.value, 10);
    if (!v || v < 1) return setError(bGuests, 'Сколько вас будет? Хотя бы один гость.');
    if (v > 8) return setError(bGuests, 'Больше восьми — это длинный стол: поставьте 8 и напишите об этом в пожеланиях.');
    return setError(bGuests, '');
  }
  bForm.addEventListener('input', function (e) {
    if (!bForm.hasAttribute('data-tried')) return;
    var id = e.target.id;
    if (id === 'b-name') checkName(bName);
    if (id === 'b-phone') checkPhone(bPhone);
    if (id === 'b-guests') checkGuests();
  });
  bForm.addEventListener('change', function (e) {
    if (!bForm.hasAttribute('data-tried')) return;
    if (e.target.id === 'b-date') { checkDate(); checkTime(); }
    if (e.target.name === 'time') checkTime();
  });
  bForm.addEventListener('submit', function (e) {
    e.preventDefault();
    bForm.setAttribute('data-tried', '');
    var checks = [
      [checkDate(), bDate],
      [checkGuests(), bGuests],
      [checkTime(), $('input[name="time"]:not(:disabled)', bForm) || bDate],
      [checkName(bName), bName],
      [checkPhone(bPhone), bPhone]
    ];
    var bad = checks.filter(function (c) { return !c[0]; })[0];
    if (bad) { bad[1].focus(); return; }
    var d = parseDate(bDate.value);
    var g = +bGuests.value;
    var WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    $('#booking-summary').textContent = WDF[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' +
      $('input[name="time"]:checked', bForm).value + '. Стол на ' + g + ' ' + plural(g, 'гостя', 'гостей', 'гостей') + ', на имя ' + bName.value.trim() + '.';
    bForm.hidden = true;
    var done = $('#booking-done');
    done.hidden = false;
    done.focus();
  });
  $('#booking-again').addEventListener('click', function () {
    $('#booking-done').hidden = true;
    bForm.hidden = false;
    bDate.focus();
  });

  /* =========================================================
     8. Перетекание цвета, бокал, появление блоков
     ========================================================= */
  var toneEls = $$('[data-tone]');
  var offsets = [];
  function measure() {
    var y = window.scrollY || window.pageYOffset;
    offsets = toneEls.map(function (el) {
      var r = el.getBoundingClientRect();
      var t = C.TONES[el.getAttribute('data-tone')];
      return { top: r.top + y, h: r.height, bg: t.bg, wine: t.wine };
    });
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  var lastKey = '';
  var themeMeta = $('meta[name="theme-color"]');
  var currentWine = C.TONES.straw.wine;
  function applyFlow() {
    if (!offsets.length) return;
    var y = (window.scrollY || window.pageYOffset) + window.innerHeight * 0.55;
    var i = 0;
    while (i < offsets.length - 1 && y >= offsets[i + 1].top) i++;
    var cur = offsets[i], next = offsets[i + 1];
    var k = 0;
    if (next) {
      var t = clamp((y - cur.top) / Math.max(1, cur.h), 0, 1);
      k = smooth(clamp((t - 0.55) / 0.45, 0, 1));
    }
    var key = i + ':' + k.toFixed(3);
    if (key === lastKey) return;
    lastKey = key;
    var bg = next ? C.mix(cur.bg, next.bg, k) : cur.bg;
    var wine = next ? C.mix(cur.wine, next.wine, k) : cur.wine;
    currentWine = wine;
    var p = C.palette(bg, wine);
    var s = root.style;
    s.setProperty('--bg', p.bg);
    s.setProperty('--ink', p.ink);
    s.setProperty('--muted', p.muted);
    s.setProperty('--line', p.line);
    s.setProperty('--line-strong', p.lineStrong);
    s.setProperty('--surface', p.surface);
    s.setProperty('--wine', p.wine);
    s.setProperty('color-scheme', p.scheme);
    if (themeMeta) themeMeta.setAttribute('content', p.bg);
  }

  // мини-бокал в логотипе — индикатор прочитанного
  var mini = $('#mini-wine');
  function applyMini() {
    var max = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight);
    var p = clamp((window.scrollY || window.pageYOffset) / max, 0, 1);
    var h = 1.5 + 12 * p;
    mini.setAttribute('y', (28.5 - h).toFixed(2));
    mini.setAttribute('height', (h + 0.5).toFixed(2));
  }

  // большой бокал
  var glassEl = $('#glass');
  var wineBody = $('#wine-body'), wineSurf = $('#wine-surface');
  var GLASS_STOPS = ['#e6c45a', '#ef9a86', '#c2283f', '#7d0f27'];
  var glass = { level: 0.3, target: 0.3, amp: 3, slosh: 0, phase: 0, running: false, visible: true, lastT: 0, color: '' };
  function heroProgress() {
    var hero = $('#top');
    var r = hero.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height * 0.85), 0, 1);
  }
  function glassColor(p) {
    var seg = p * (GLASS_STOPS.length - 1);
    var i = Math.min(GLASS_STOPS.length - 2, Math.floor(seg));
    return C.mix(GLASS_STOPS[i], GLASS_STOPS[i + 1], seg - i);
  }
  function drawGlass() {
    var bottom = 272, top = 40;
    var ly = bottom - glass.level * (bottom - top);
    var pts = [];
    for (var x = 40; x <= 260; x += 10) {
      var y = ly + glass.amp * Math.sin(x * 0.034 + glass.phase) + glass.amp * 0.45 * Math.sin(x * 0.081 - glass.phase * 1.35);
      pts.push(x + ' ' + y.toFixed(2));
    }
    var line = 'M' + pts.join(' L');
    wineSurf.setAttribute('d', line);
    wineBody.setAttribute('d', line + ' L260 300 L40 300Z');
  }
  function syncGlassTarget() {
    var p = heroProgress();
    glass.target = 0.3 + 0.45 * p;
    var c = glassColor(p);
    if (c !== glass.color) { glass.color = c; glassEl.style.setProperty('--wine', c); }
  }
  function glassLoop(t) {
    if (!glass.running) return;
    var dt = glass.lastT ? Math.min(0.05, (t - glass.lastT) / 1000) : 0.016;
    glass.lastT = t;
    glass.phase += dt * 1.7;
    glass.level += (glass.target - glass.level) * Math.min(1, dt * 4);
    glass.slosh *= Math.pow(0.12, dt);
    glass.amp = 3.2 + glass.slosh;
    drawGlass();
    requestAnimationFrame(glassLoop);
  }
  function startGlass() {
    if (glass.running || reduced() || !glass.visible || doc.hidden) return;
    glass.running = true; glass.lastT = 0;
    requestAnimationFrame(glassLoop);
  }
  function stopGlass() { glass.running = false; }
  function initGlass() {
    syncGlassTarget();
    glass.level = glass.target;
    if (reduced()) { glass.level = 0.55; glass.amp = 0; glassEl.style.setProperty('--wine', glassColor(0)); drawGlass(); return; }
    drawGlass();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        glass.visible = en[0].isIntersecting;
        if (glass.visible) startGlass(); else stopGlass();
      }).observe(glassEl);
    }
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) stopGlass(); else startGlass(); });
    startGlass();
  }

  function onScroll(velocity) {
    if (root.classList.contains('flow')) applyFlow();
    applyMini();
    if (!reduced()) {
      syncGlassTarget();
      if (velocity) glass.slosh = Math.min(13, glass.slosh + Math.abs(velocity) * 0.0009);
    }
  }

  function initMotion() {
    measure();
    initGlass();
    if (hasGsap) {
      var gsap = window.gsap, ST = window.ScrollTrigger;
      gsap.registerPlugin(ST);
      ST.create({
        start: 0, end: 'max',
        onUpdate: function (self) { onScroll(self.getVelocity()); },
        onRefresh: function () { measure(); lastKey = ''; onScroll(0); }
      });
      if (!reduced()) {
        gsap.from(glassEl, { y: 40, opacity: 0, duration: 1.3, ease: 'power3.out', delay: 0.15, clearProps: 'opacity,transform' });
        $$('[data-reveal]').forEach(function (el) {
          gsap.from(el, {
            y: 34, opacity: 0, duration: 0.9, ease: 'power3.out', clearProps: 'opacity,transform',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true }
          });
        });
      }
      // высота страницы меняется при фильтрации — пересчитываем точки
      if ('ResizeObserver' in window) {
        var rt = 0;
        new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { ST.refresh(); }, 150); }).observe($('#main'));
      }
    } else {
      // запасной путь, если GSAP не загрузился
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return; ticking = true;
        requestAnimationFrame(function () { ticking = false; onScroll(0); });
      }, { passive: true });
      window.addEventListener('resize', function () { measure(); lastKey = ''; onScroll(0); });
    }
    onScroll(0);
  }

  // смена системной настройки «уменьшить движение» на лету
  var onReduce = function () {
    if (reduced()) { root.classList.remove('flow'); root.removeAttribute('style'); stopGlass(); glass.amp = 0; drawGlass(); }
    else { root.classList.add('flow'); lastKey = ''; applyFlow(); startGlass(); }
  };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);

  /* ---------- старт ---------- */
  initMotion();
  loadData().then(initPicker).catch(function (err) {
    countEl.textContent = 'Не получилось загрузить карту вин — смотрите статичный список ниже.';
    if (window.console) console.warn(err);
  });
})();
