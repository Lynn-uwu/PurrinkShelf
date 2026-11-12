const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(1200);
  await p.screenshot({path: path.join(__dirname, 'shots7/tb-home.png')});
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(800);
  await p.screenshot({path: path.join(__dirname, 'shots7/tb-library.png'), clip: {x: 0, y: 700, width: 702, height: 236}});
  await b.close(); })();
