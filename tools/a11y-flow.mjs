// Контраст axe-core в 25 точках прокрутки при перетекании цвета: AXE=путь/к/axe.min.js node tools/a11y-flow.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axe = readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('pogreb-age', 'yes'));
const p = await ctx.newPage();
await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } });
await p.addScriptTag({ content: axe });
const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
let bad = 0;
for (let i = 0; i <= 24; i++) {
  await p.evaluate(y => scrollTo(0, y), Math.round(H * i / 24));
  await p.waitForTimeout(450);
  const r = await p.evaluate(async () => { const res = await axe.run(document, { runOnly: ['color-contrast'] }); return { bg: getComputedStyle(document.documentElement).getPropertyValue('--bg'), v: res.violations.flatMap(v => v.nodes.map(n => n.target.join(' ') + ' ' + n.any[0]?.message)).slice(0, 3) }; });
  if (r.v.length) { bad++; console.log(i, r.bg, r.v.join('\n  ')); }
}
console.log('позиций с нарушениями:', bad, 'из 25');
await b.close();
