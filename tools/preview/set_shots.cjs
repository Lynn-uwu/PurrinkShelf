const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots19'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = async n => { await p.waitForTimeout(600); await p.screenshot({path: path.join(out, n + '.png')}); console.log(n); };
  for (const [q, tag] of [['', 'plain'], ['&cat=1', 'cats']]) {
    await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1' + q); await p.waitForTimeout(14000);
    await p.getByLabel('Settings', {exact: true}).first().click(); await shot(tag + '-1-settings');
    await p.getByText('Show and hide', {exact: true}).click(); await shot(tag + '-2-show');
    await p.getByLabel('Back', {exact: true}).last().click(); await p.waitForTimeout(300);
    await p.getByText('Appearance', {exact: true}).click(); await shot(tag + '-3-appearance');
  }
  await b.close(); })();
