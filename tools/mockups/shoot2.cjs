const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  await p.goto('file://' + path.join(__dirname, 'toc.html')); await p.waitForTimeout(400);
  for (const id of ['a','b','c','d','e','g']) {
    await p.evaluate(id => { document.querySelectorAll('.f').forEach(f => f.classList.remove('on')); document.getElementById(id).classList.add('on'); }, id);
    await p.waitForTimeout(120); await p.screenshot({path: path.join(__dirname, 'toc-' + id + '.png')});
  }
  await b.close(); })();
