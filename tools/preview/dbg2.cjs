const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&reading=1'); await p.waitForTimeout(7000);
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(800);
  console.log(await p.evaluate(() => document.body.innerText.includes('Min Seo')), await p.evaluate(() => document.body.innerText.slice(0, 1500)));
  await b.close(); })();
