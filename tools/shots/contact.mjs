// Roster contact sheet: one row per track, before | after for two fixed views, a few tracks per page.
// node tools/shots/contact.mjs <outPrefix> <rowsPerPage> <viewA> <viewB> <label|beforeDir|afterDir>...
// Writes <outPrefix>-1.png, <outPrefix>-2.png, …; a missing image renders as a grey "missing" cell.
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const [prefix, perPageArg, viewA, viewB, ...rows] = process.argv.slice(2);
const perPage = Number(perPageArg) || 7;
const img = (f) => (existsSync(f)
  ? `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:384px;height:216px;display:block">`
  : '<div style="width:384px;height:216px;background:#333;display:flex;align-items:center;justify-content:center">missing</div>');
const head = [`${viewA} · 변경 전`, `${viewA} · 변경 후`, `${viewB} · 변경 전`, `${viewB} · 변경 후`];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1716, height: 400 } });
for (let p = 0; p * perPage < rows.length; p++) {
  const chunk = rows.slice(p * perPage, (p + 1) * perPage).map((r) => r.split('|'));
  const body = chunk.map(([label, b, a]) => `<tr><td style="width:170px;padding:0 10px;vertical-align:middle">${label}</td>${
    [`${b}/${viewA}.png`, `${a}/${viewA}.png`, `${b}/${viewB}.png`, `${a}/${viewB}.png`].map((f) => `<td style="padding:2px">${img(f)}</td>`).join('')}</tr>`).join('');
  await page.setContent(`<body style="margin:0;background:#111;color:#eee;font:600 15px system-ui">
    <table style="border-collapse:collapse"><tr><td></td>${head.map((h) => `<td style="padding:6px 4px">${h}</td>`).join('')}</tr>${body}</table></body>`);
  const f = `${prefix}-${p + 1}.png`;
  await page.screenshot({ path: f, fullPage: true });
  console.log(f);
}
await browser.close();
