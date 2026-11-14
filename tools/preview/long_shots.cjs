const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots26'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const tab = n => p.getByTestId('taskbar').getByLabel(n, {exact: true});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&long=1'); await p.waitForTimeout(15000);
  for (const [t, n] of [['The Reluctant Court', '1-long'], ['After Transmigrating', '2-longer'], ['Moon Over the Jade', '3-short']]) {
    await p.getByPlaceholder('Search titles').fill(t.split(' ').slice(-1)[0] === 'Court' ? 'Reluctant' : t.split(' ')[0] === 'After' ? 'Transmigrating' : 'Jade');
    await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    await p.getByText(new RegExp('^' + t)).first().click(); await p.waitForTimeout(900);
    await p.screenshot({path: path.join(out, n + '.png')}); console.log(n);
    await p.mouse.click(350, 12); await p.waitForTimeout(500);
    await tab('Home').click().catch(() => {}); await p.waitForTimeout(500);
  }
  await b.close(); })();
