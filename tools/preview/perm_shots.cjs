const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots21'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  for (const [pick, tag] of [['2', 'always'], ['1', 'once']]) {
    await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&perm=1&pick=' + pick); await p.waitForTimeout(9000);
    await p.screenshot({path: path.join(out, tag + '-1-before.png')});
    await p.getByText('Ask Supernote', {exact: true}).click(); await p.waitForTimeout(1500);
    await p.screenshot({path: path.join(out, tag + '-2-after.png')});
  }
  await b.close(); })();
