// Draws the CSV the way it looks in Excel on a laptop (before and after filling in).
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'shots7');
const parse = t => {
  t = t.replace(/^﻿/, ''); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x)) rows.push(row); row = []; } else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
};
const page = (rows, edited, sel) => {
  const show = [0, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // hide Library, Folder, File, ID to fit (they are still in the file)
  const L = 'ABCDEFGHIJKLMN';
  const widths = {0: 210, 4: 150, 5: 150, 6: 170, 7: 80, 8: 170, 9: 90, 10: 100, 11: 80, 12: 260};
  const head = `<tr><th class=n style="width:34px"></th>${show.map(c => `<th style="width:${widths[c]}px">${L[c]}</th>`).join('')}</tr>`;
  const body = rows.slice(0, 16).map((r, i) => `<tr><td class=n>${i + 1}</td>${show.map(c => {
    const e = edited && edited.has(`${i},${c}`);
    const s = sel && sel[0] === i && sel[1] === c;
    return `<td class="${i === 0 ? 'h' : ''} ${e ? 'e' : ''} ${s ? 's' : ''}">${(r[c] || '').replace(/</g, '&lt;')}</td>`;
  }).join('')}</tr>`).join('');
  const sv = sel ? rows[sel[0]][sel[1]] : '';
  return `<html><body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#fff">
  <div style="background:#217346;color:#fff;padding:8px 14px;font-size:14px">InkShelf books.csv &nbsp;-&nbsp; Excel</div>
  <div style="display:flex;align-items:center;border-bottom:1px solid #ccc;font-size:13px;padding:5px 8px;gap:10px"><span style="border:1px solid #bbb;padding:2px 10px;width:50px">${sel ? L[sel[1]] + (sel[0] + 1) : 'A1'}</span><i>fx</i><span>${sv}</span></div>
  <table>${head}${body}</table>
  <style>table{border-collapse:collapse;font-size:12px;table-layout:fixed}th{background:#f3f3f3;border:1px solid #d4d4d4;font-weight:normal;color:#444;height:20px}
  td{border:1px solid #e1e1e1;height:22px;padding:0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0}
  td.n{background:#f3f3f3;color:#444;text-align:center;width:30px}td.h{font-weight:bold;background:#e8f1ea}td.e{background:#fff4c2}td.s{outline:2px solid #217346;outline-offset:-2px}</style></body></html>`;
};
(async () => {
  const before = parse(fs.readFileSync(path.join(out, 'sheet.csv'), 'utf8'));
  const after = parse(fs.readFileSync(path.join(out, 'sheet-edited.csv'), 'utf8'));
  const ed = new Set();
  after.forEach((r, i) => r.forEach((v, c) => { if ((before[i] || [])[c] !== v) ed.add(`${i},${c}`); }));
  const row = after.findIndex(r => r[0] === 'Crane and the Clockmaker');
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1440, height: 470}, deviceScaleFactor: 1});
  await p.setContent(page(before, null, null)); await p.screenshot({path: path.join(out, 'excel-1-as-made.png')});
  await p.setContent(page(after, ed, [row, 6])); await p.screenshot({path: path.join(out, 'excel-2-filled-in.png')});
  await b.close(); console.log('ok', row);
})();
