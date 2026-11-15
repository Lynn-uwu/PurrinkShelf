const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots30'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = async n => { await p.waitForTimeout(700); await p.screenshot({path: path.join(out, n + '.png')}); console.log(n); };
  for (const [q, n] of [['', 'plain'], ['&cat=1', 'cats']]) {
    await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=1&state=1&prog=1&ao3=1' + q); await p.waitForTimeout(13000);
    await p.getByText('Echoes of the Ninth Gate', {exact: true}).first().click(); await shot(n + '-1book');
    await p.getByLabel('Chapters', {exact: true}).click(); await shot(n + '-2chapters');
  }
  await b.close(); })();
