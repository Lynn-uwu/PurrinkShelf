const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 3});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&cat=1'); await p.waitForTimeout(14000);
  await p.screenshot({path: path.join(__dirname, 'shots18', 'ears3x.png'), clip: {x: 261, y: 770, width: 180, height: 110}});
  await b.close(); })();
