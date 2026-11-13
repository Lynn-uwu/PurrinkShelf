const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  await p.goto('file://' + path.join(__dirname, 'mock.html')); await p.waitForTimeout(500);
  for (let i = 1; i <= 6; i++) {
    await p.evaluate(i => { document.querySelectorAll('.f').forEach(f => f.classList.remove('on')); document.getElementById('f' + i).classList.add('on'); }, i);
    await p.waitForTimeout(150); await p.screenshot({path: path.join(__dirname, i + '.png')});
  }
  await b.close(); })();
