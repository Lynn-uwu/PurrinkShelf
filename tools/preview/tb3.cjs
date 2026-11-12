const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(1200);
  await p.getByRole('button', {name: 'Collections', exact: true}).last().click(); await p.waitForTimeout(6000);
  await p.screenshot({path: path.join(__dirname, 'shots7/tb-col.png')});
  await b.close(); })();
