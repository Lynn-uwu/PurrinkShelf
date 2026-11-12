const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots19');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&cat=1'); await p.waitForTimeout(14000);
  await p.getByLabel('Settings', {exact: true}).first().click(); await p.waitForTimeout(400);
  await p.getByText('Show and hide', {exact: true}).click(); await p.waitForTimeout(800);
  await p.screenshot({path: path.join(out, 'cats-off.png')});
  await p.screenshot({path: path.join(out, 'cats-off-zoom.png'), clip: {x: 420, y: 140, width: 260, height: 160}});
  await b.close(); })();
