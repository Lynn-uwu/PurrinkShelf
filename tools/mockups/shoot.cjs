const {chromium} = require('playwright'); const path = require('path');
const ids = ['f1','f1b','f2','f3','f3b','f4','f5','f5b'];
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  await p.goto('file://' + path.join(__dirname, 'mock.html')); await p.waitForTimeout(500);
  for (const id of ids) {
    await p.evaluate(id => { document.querySelectorAll('.f').forEach(f => f.classList.remove('on')); document.getElementById(id).classList.add('on'); }, id);
    await p.waitForTimeout(150); await p.screenshot({path: path.join(__dirname, id.slice(1) + '.png')});
  }
  await b.close(); })();
