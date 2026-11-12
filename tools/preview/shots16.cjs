const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(6000);
  await p.getByLabel('Settings', {exact: true}).first().click(); await p.waitForTimeout(400);
  await p.screenshot({path: path.join(__dirname, 'shots15', 'settings.png')});
  await b.close(); })();
