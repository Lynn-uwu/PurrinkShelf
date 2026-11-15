const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('console', m => { const t = m.text(); if (/LOG|DBG/.test(t)) console.log(t.slice(0, 300)); });
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=1&state=1&prog=1&reading=echo&page=410&pages=412'); await p.waitForTimeout(14000);
  await b.close(); })();
