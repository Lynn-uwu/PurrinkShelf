const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('console', m => m.text().includes('sheet') && console.log(m.text().slice(0, 600)));
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(900);
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(6000);
  await p.getByLabel('Data and storage', {exact: true}).first().click(); await p.getByText('Make the sheet').click(); await p.waitForTimeout(500);
  await p.getByText('Read changes now').click(); await p.waitForTimeout(800); await b.close(); })();
