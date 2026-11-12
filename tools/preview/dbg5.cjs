const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1'); await p.waitForTimeout(6000);
  const f = await p.evaluate(() => { const m = JSON.parse(window.__files['/storage/ABCD-1234/Novels/.inkshelf/library.json']).books; return Object.entries(m).map(([k, v]) => k + ' ' + JSON.stringify({l: v.length, p: v.probed, r: v.reading?.state})); });
  console.log(f.join('\n'));
  await b.close(); })();
