const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots25'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  const tab = n => p.getByTestId('taskbar').getByLabel(n, {exact: true});
  for (const [q, tag] of [['', 'plain'], ['&cat=1', 'cats']]) {
    await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1' + q); await p.waitForTimeout(14000);
    await p.screenshot({path: path.join(out, tag + '-home.png')});
    await tab('Library').click(); await p.waitForTimeout(800);
    await p.screenshot({path: path.join(out, tag + '-library.png')});
    await tab('Profile').click(); await p.waitForTimeout(500);
    await p.screenshot({path: path.join(out, tag + '-profile.png')});
  }
  await b.close(); })();
