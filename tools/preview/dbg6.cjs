const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('console', m => m.text().startsWith('LOG') && /wish|scan/i.test(m.text()) && console.log(m.text()));
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1'); await p.waitForTimeout(6000);
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => JSON.stringify(JSON.parse(window.__state).activity.map(x => x.t)) + ' ' + JSON.stringify(JSON.parse(window.__state).wishlist.map(x => x.title))));
  await b.close(); })();
