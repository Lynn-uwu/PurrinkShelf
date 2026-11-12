const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1300, height: 490}});
  for (const n of ['x1', 'x2', 'x3']) { await p.goto('file://' + path.join(__dirname, 'shots10', n + '.html')); await p.screenshot({path: path.join(__dirname, 'shots10', n + '.png')}); }
  await b.close(); })();
