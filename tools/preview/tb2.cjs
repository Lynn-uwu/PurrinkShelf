const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelectorAll('[aria-label="Dismiss"]').forEach(e => e.remove()));
  await p.screenshot({path: path.join(__dirname, 'shots7/tb-zoom.png'), clip: {x: 230, y: 790, width: 240, height: 146}});
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll('[aria-label="Dismiss"]').forEach(e => e.remove()));
  await p.screenshot({path: path.join(__dirname, 'shots7/tb-lib.png'), clip: {x: 0, y: 760, width: 702, height: 176}});
  await b.close(); })();
