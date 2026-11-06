// Генерирует img/og.png (1200×630) и PNG-фавиконы из SVG. Нужен локальный сервер на 8765.
// Запуск: node tools/assets.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(BASE + 'tools/og.html', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'img/og.png' });

for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [512, 'icon-512.png']]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0"><img src="${BASE}img/favicon.svg" width="${size}" height="${size}" style="display:block"></body></html>`);
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: 'img/' + name, omitBackground: true });
  await p.close();
}
await browser.close();
console.log('ok');
