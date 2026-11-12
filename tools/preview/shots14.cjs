const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots14'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1'); await p.waitForTimeout(2000);
  await p.screenshot({path: path.join(out, 'stack.png')});
  await p.waitForTimeout(4000); await p.screenshot({path: path.join(out, 'after.png')});
  await b.close(); })();
