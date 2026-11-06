// Синхронизирует данные: data/wines.json → статичная карта вин и инлайн-копия в index.html,
// плюс статичные тоны секций в css/style.css (для режима без JS и prefers-reduced-motion).
// Запуск: node tools/sync.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../js/color.js');

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const write = (p, s) => writeFileSync(new URL(p, root), s);
const data = JSON.parse(read('data/wines.json'));

const rub = (n) => n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function replaceBetween(src, start, end, body) {
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b < 0) throw new Error('markers not found: ' + start);
  return src.slice(0, a + start.length) + '\n' + body + '\n' + src.slice(b);
}

// 1. Статичная карта вин
const groups = ['white', 'rose', 'red', 'sparkling'];
let list = '';
for (const g of groups) {
  const items = data.wines.filter((w) => w.color === g);
  list += `        <div class="winelist__group" data-reveal>\n`;
  list += `          <h3 class="winelist__h"><i class="dot dot--${g}" aria-hidden="true"></i>${data.colors[g]}</h3>\n`;
  list += `          <p class="winelist__legend" aria-hidden="true"><span>бокал</span><span>бутылка</span></p>\n`;
  list += `          <ul class="winelist__items">\n`;
  for (const w of items) {
    list += `            <li class="wl"><span class="wl__name">${esc(w.name)}</span><span class="wl__meta">${esc(w.grape)} · ${esc(w.region)} · ${w.year}</span>` +
      `<span class="wl__price"><span class="visually-hidden">бокал </span>${rub(w.glass)}</span>` +
      `<span class="wl__price"><span class="visually-hidden">бутылка в зале </span>${rub(w.bottle)}</span></li>\n`;
  }
  list += `          </ul>\n        </div>`;
  if (g !== 'sparkling') list += '\n';
}
let html = read('index.html');
html = replaceBetween(html, '<!-- WINE-LIST:START -->', '<!-- WINE-LIST:END -->', list);

// 2. Инлайн-копия данных (фолбэк для file://, где fetch не работает)
const inline = `<script type="application/json" id="wines-inline">${JSON.stringify(data)}</script>`;
html = replaceBetween(html, '<!-- WINE-DATA:START -->', '<!-- WINE-DATA:END -->', inline);
write('index.html', html);

// 3. Статичные тоны
const css0 = read('css/style.css');
let tones = '';
const toVars = (p) => `--bg:${p.bg};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--line-strong:${p.lineStrong};--surface:${p.surface};--wine:${p.wine};color-scheme:${p.scheme}`;
const first = C.TONES.straw;
tones += `:root{${toVars(C.palette(first.bg, first.wine))}}\n`;
for (const [k, t] of Object.entries(C.TONES)) {
  tones += `html:not(.flow) [data-tone="${k}"]{${toVars(C.palette(t.bg, t.wine))};background:var(--bg);color:var(--ink)}\n`;
}
write('css/style.css', replaceBetween(css0, '/* TONES:START */', '/* TONES:END */', tones.trim()));
console.log('ok: wines', data.wines.length);
