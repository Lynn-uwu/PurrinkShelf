const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=1&state=1&longrow=1'); await p.waitForTimeout(12000);
  await p.getByLabel('Library', {exact: true}).first().click(); await p.waitForTimeout(800);
  await p.getByLabel('Hide filters', {exact: true}).first().click(); await p.waitForTimeout(500);
  for (let i = 0; i < 4 && !(await p.getByText('Moon Over the Jade Pavilion and', {exact: false}).count()); i++) { await p.getByLabel(/^Next( page)?$/).last().click(); await p.waitForTimeout(500); }
  await p.screenshot({path: path.join(__dirname, 'shots36/rows.png')});
  await b.close(); })();
