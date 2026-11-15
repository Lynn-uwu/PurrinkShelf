const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots32'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  for (const [q, n] of [['', 'plain'], ['&cat=1', 'cats']]) {
    await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=1&state=1' + q); await p.waitForTimeout(12000);
    await p.getByLabel('Settings', {exact: true}).first().click();
    await p.getByText('Permissions', {exact: true}).click(); await p.waitForTimeout(700);
    await p.screenshot({path: path.join(out, n + '.png')}); console.log(n);
  }
  await b.close(); })();
