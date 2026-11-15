const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots27'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(14000);
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await p.waitForTimeout(700);
  await p.getByLabel('Edit details', {exact: true}).click(); await p.waitForTimeout(800);
  const inputs = p.locator('input, textarea');
  const n = await inputs.count(); console.log('inputs', n);
  let target = null, best = -1;
  for (let i = 0; i < n; i++) { const bb = await inputs.nth(i).boundingBox(); if (bb && bb.y > best && bb.y < 900) { best = bb.y; target = i; } }
  console.log('lowest input at', best);
  const KB = 380;
  const drawKb = async () => p.evaluate(h => { let d = document.getElementById('kb'); if (!d) { d = document.createElement('div'); d.id = 'kb'; document.body.appendChild(d); }
    Object.assign(d.style, {position: 'fixed', left: 0, right: 0, bottom: 0, height: h + 'px', background: '#d6d6d6', borderTop: '2px solid #111', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 22px Inter, sans-serif', color: '#444'}); d.textContent = 'Supernote keyboard'; }, KB);
  await p.evaluate(() => (globalThis.__fakeKeyboard || (() => {}))(0));
  await inputs.nth(target).click(); await p.waitForTimeout(300);
  await drawKb(); await p.screenshot({path: path.join(out, '1-before.png')});
  await p.evaluate(h => globalThis.__fakeKeyboard(h), KB); await p.waitForTimeout(400);
  await p.screenshot({path: path.join(out, '2-after.png')});
  await b.close(); })();
