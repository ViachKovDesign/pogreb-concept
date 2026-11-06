// Проверка доступности axe-core: AXE=путь/к/axe.min.js node tools/a11y.mjs (нужен сервер на 8765)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axe = readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch();
for (const [w, rm] of [[1280, false], [375, false], [1280, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, reducedMotion: rm ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => localStorage.setItem('pogreb-age', 'yes'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } scrollTo(0,0); });
  await p.waitForTimeout(800);
  await p.addScriptTag({ content: axe });
  // контраст проверяем в режиме статичных тонов (каждая секция в своём цвете)
  await p.evaluate(() => { document.documentElement.classList.remove('flow'); document.documentElement.removeAttribute('style'); });
  await p.waitForTimeout(600);
  await p.click('.wheel__sector[data-aroma="spice"]');
  const r = await p.evaluate(async () => { const res = await axe.run(document, { resultTypes: ['violations'] }); return res.violations.map(v => v.id + ' (' + v.impact + '): ' + v.nodes.length + ' — ' + v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' | ')); });
  console.log(w, rm ? 'reduced' : '', r.length ? r.join('\n') : 'нарушений нет');
  await ctx.close();
}
await b.close();
