// Скриншоты и автопроверки. Нужен локальный сервер: python3 -m http.server 8765
// Запуск: node tools/shoot.mjs [папка=screenshots] [--quick]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'screenshots';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const problems = [];
const log = (...a) => console.log(...a);

async function newPage(browser, width, height, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ru-RU', viewport: { width, height }, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${width}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${width}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${width}] requestfailed: ${r.url()}`));
  if (opts.adult !== false) await ctx.addInitScript(() => { try { localStorage.setItem('pogreb-age', 'yes'); } catch (e) {} });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += Math.round(innerHeight * 0.6)) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
  });
}

async function hScrollCheck(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (r.sw > r.cw) problems.push(`[${label}] горизонтальный скролл: ${r.sw} > ${r.cw}`);
  const wide = await page.evaluate(() => {
    const out = [];
    const cw = document.documentElement.clientWidth;
    document.querySelectorAll('body *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > cw + 1) && getComputedStyle(el).position !== 'fixed' && !el.closest('.hall__art, dialog, .age')) out.push(el.tagName + '.' + el.className + ' ' + Math.round(b.right));
    });
    return out.slice(0, 8);
  });
  if (wide.length) problems.push(`[${label}] элементы шире экрана: ${wide.join(' | ')}`);
}

async function fullShots(browser) {
  const sizes = QUICK ? [[1280, 800], [375, 740]] : [[375, 740], [768, 1024], [1280, 800], [1920, 1080], [360, 740]];
  for (const [w, h] of sizes) {
    const { ctx, page } = await newPage(browser, w, h, { touch: w < 800 });
    await scrollThrough(page);
    await hScrollCheck(page, w);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/first-screen-${w}.png` });
    if (w === 1280 || w === 375) {
      // кадры перетекания цвета: тот же экран на разной глубине прокрутки
      const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      const n = 8;
      for (let i = 1; i <= n; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(H * i / n));
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${OUT}/flow-${w}-${String(i).padStart(2, '0')}.png` });
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    }
    // полная страница: цвет зависит от прокрутки, поэтому для общего вида
    // включаем статичные тоны секций (тот же режим, что без JS / reduced-motion)
    await page.evaluate(() => { document.documentElement.classList.remove('flow'); document.documentElement.removeAttribute('style'); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/full-${w}.png`, fullPage: true });
    log('full', w);
    await ctx.close();
  }
}

async function states(browser) {
  // 1. экран 18+
  {
    const { ctx, page } = await newPage(browser, 1280, 800, { adult: false });
    await page.screenshot({ path: `${OUT}/state-age-gate-1280.png` });
    await page.click('[data-age="no"]');
    await page.screenshot({ path: `${OUT}/state-age-denied-1280.png` });
    await page.click('[data-age="retry"]');
    await page.click('[data-age="yes"]');
    const pending = await page.evaluate(() => document.documentElement.classList.contains('age-pending'));
    if (pending) problems.push('18+: после «Да» экран не закрылся');
    const stored = await page.evaluate(() => localStorage.getItem('pogreb-age'));
    if (stored !== 'yes') problems.push('18+: выбор не сохранён');
    await ctx.close();
    const m = await newPage(browser, 375, 740, { adult: false, touch: true });
    await m.page.screenshot({ path: `${OUT}/state-age-gate-375.png` });
    await m.ctx.close();
  }
  // 2. подбор: сдвиг ползунков меняет порядок
  {
    const { ctx, page } = await newPage(browser, 1280, 900);
    await page.locator('#pick').scrollIntoViewIfNeeded();
    const order = () => page.$$eval('#cards > li:not([hidden])', (l) => l.map((x) => x.dataset.id));
    const before = await order();
    await page.$eval('#r-sweet', (r) => { r.value = 7; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#r-body', (r) => { r.value = 6; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#r-soft', (r) => { r.value = 8; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(800);
    const after = await order();
    if (JSON.stringify(before) === JSON.stringify(after)) problems.push('подбор: порядок карточек не изменился');
    else log('подбор: порядок изменился', before.slice(0, 3), '→', after.slice(0, 3));
    await page.evaluate(() => document.querySelector('#pick').scrollIntoView());
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/state-pick-sliders-1280.png` });
    // клавиатура: стрелка на ползунке
    await page.focus('#r-sweet');
    await page.keyboard.press('ArrowLeft');
    const v = await page.$eval('#r-sweet', (r) => r.value);
    if (v !== '6') problems.push('подбор: ползунок не реагирует на клавиатуру');
    // пустое состояние
    await page.$eval('#r-sweet', (r) => { r.value = 10; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#r-body', (r) => { r.value = 10; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.chip:has(input[value="sparkling"])');
    await page.waitForTimeout(500);
    const emptyVisible = await page.isVisible('#empty');
    if (!emptyVisible) problems.push('подбор: пустое состояние не показалось');
    await page.evaluate(() => document.querySelector('.pick__results').scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/state-pick-empty-1280.png` });
    await page.click('#empty-reset');
    await page.waitForTimeout(300);
    // колесо ароматов
    await page.evaluate(() => document.querySelector('#wheel').scrollIntoView({ block: 'center' }));
    await page.click('.wheel__sector[data-aroma="flower"]');
    await page.waitForTimeout(300);
    const hits = await page.$$eval('.card.is-hit', (l) => l.length);
    if (!hits) problems.push('колесо: нет подсвеченных карточек');
    await page.screenshot({ path: `${OUT}/state-wheel-active-1280.png` });
    // клавиатура на колесе
    await page.focus('.wheel__sector[data-aroma="flower"]');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const pressed = await page.$eval('.wheel__sector[aria-pressed="true"]', (g) => g.dataset.aroma).catch(() => null);
    if (pressed !== 'herb') problems.push('колесо: клавиатура не работает, нажато ' + pressed);
    // ссылка сомелье
    await page.click('[data-wine-link="zolotovsky"]');
    await page.waitForTimeout(900);
    const firstId = (await order())[0];
    if (firstId !== 'zolotovsky') problems.push('сомелье: ссылка не вывела вино первым, первое ' + firstId);
    await ctx.close();
  }
  // 2б. подбор на телефоне
  {
    const { ctx, page } = await newPage(browser, 375, 740, { touch: true });
    await page.$eval('#r-body', (r) => { r.value = 9; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('#pick .pick__panel').scrollIntoView());
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/state-pick-375.png` });
    await page.tap('.wheel__sector[data-aroma="spice"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#wheel').scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.screenshot({ path: `${OUT}/state-wheel-375.png` });
    // меню-бургер
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.tap('.burger');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/state-menu-375.png` });
    await ctx.close();
  }
  // 3. форма ужина
  {
    const { ctx, page } = await newPage(browser, 1280, 800);
    await page.click('[data-signup="1"]');
    await page.waitForTimeout(200);
    await page.click('#dinner-form button[type="submit"]');
    const errs = await page.$$eval('#dinner-form .field__err:not([hidden])', (l) => l.length);
    if (!errs) problems.push('ужин: пустая форма прошла валидацию');
    await page.screenshot({ path: `${OUT}/state-dinner-errors-1280.png` });
    await page.fill('#d-name', 'Слава');
    await page.fill('#d-phone', '9001234567');
    await page.selectOption('#d-guests', '2');
    await page.screenshot({ path: `${OUT}/state-dinner-form-1280.png` });
    await page.click('#dinner-form button[type="submit"]');
    await page.waitForTimeout(200);
    const done = await page.isVisible('#dinner-done');
    if (!done) problems.push('ужин: подтверждение не показалось');
    await page.screenshot({ path: `${OUT}/state-dinner-done-1280.png` });
    await page.keyboard.press('Escape');
    const seats = await page.$eval('[data-dinner="1"] .dinner__seats', (e) => e.textContent);
    if (!/1 место/.test(seats)) problems.push('ужин: места не уменьшились: ' + seats);
    await ctx.close();
    const m = await newPage(browser, 375, 740, { touch: true });
    await m.page.tap('[data-signup="0"]');
    await m.page.waitForTimeout(250);
    await m.page.screenshot({ path: `${OUT}/state-dinner-form-375.png` });
    await m.ctx.close();
  }
  // 4. бронь стола
  {
    const { ctx, page } = await newPage(browser, 1280, 900);
    await page.evaluate(() => document.querySelector('#booking').scrollIntoView());
    await page.click('#booking-form button[type="submit"]');
    await page.waitForTimeout(200);
    const errs = await page.$$eval('#booking-form .field__err:not([hidden])', (l) => l.length);
    if (errs < 3) problems.push('бронь: мало ошибок на пустой форме: ' + errs);
    await page.evaluate(() => document.querySelector('#booking').scrollIntoView());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/state-booking-errors-1280.png` });
    // ближайший вторник
    const date = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    await page.fill('#b-date', date);
    await page.$eval('#b-date', (i) => i.dispatchEvent(new Event('change', { bubbles: true })));
    const slot = await page.$('input[name="time"]:not(:disabled)');
    await slot.check({ force: true });
    await page.click('.stepper__btn[data-step="1"]');
    await page.fill('#b-name', 'Слава');
    await page.fill('#b-phone', '+7 900 123 45 67');
    await page.fill('#b-wish', 'Столик в нише, если можно');
    await page.click('#booking-form button[type="submit"]');
    await page.waitForTimeout(300);
    const done = await page.isVisible('#booking-done');
    if (!done) problems.push('бронь: подтверждение не показалось');
    await page.evaluate(() => document.querySelector('#booking').scrollIntoView());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/state-booking-done-1280.png` });
    // низ страницы
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/state-cellar-bottom-1280.png` });
    await ctx.close();
  }
  // 5. reduced motion
  {
    const { ctx, page } = await newPage(browser, 1280, 800, { reduced: true });
    const flow = await page.evaluate(() => document.documentElement.classList.contains('flow'));
    if (flow) problems.push('reduced-motion: перетекание не отключилось');
    const hidden = await page.$$eval('[data-reveal]', (l) => l.filter((e) => getComputedStyle(e).opacity !== '1').length);
    if (hidden) problems.push('reduced-motion: скрытых блоков ' + hidden);
    await page.screenshot({ path: `${OUT}/state-reduced-motion-1280.png`, fullPage: true });
    await ctx.close();
  }
  // 6. без JavaScript
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const items = await page.$$eval('.wl', (l) => l.length);
    if (items < 16) problems.push('без JS: карта вин не видна');
    await page.screenshot({ path: `${OUT}/state-no-js-1280.png`, fullPage: true });
    await ctx.close();
  }
}

const browser = await chromium.launch({ args: ['--lang=ru-RU'] });
try {
  await fullShots(browser);
  if (!QUICK) await states(browser);
} finally {
  await browser.close();
}
if (problems.length) { console.log('\nПРОБЛЕМЫ:\n' + [...new Set(problems)].join('\n')); process.exitCode = 1; }
else console.log('\nПроблем не найдено.');
