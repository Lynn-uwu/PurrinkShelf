const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots17'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const tab = n => p.getByTestId('taskbar').getByLabel(n, {exact: true});
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({path: path.join(out, n + '.png')}); console.log(n); };
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&cat=1&goal=1'); await p.waitForTimeout(14000);
  await shot('1-home');
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await shot('2-book');
  await p.getByLabel(/^3 notes/).first().click(); await shot('3-notes');
  await p.getByLabel('Back to the book', {exact: true}).click(); await p.mouse.click(350, 12); await p.waitForTimeout(300);
  await p.getByLabel('Settings', {exact: true}).first().click(); await shot('4-settings');
  await p.mouse.click(350, 12); await p.waitForTimeout(300);
  await tab('Collections').click(); await p.getByText('Wishlist', {exact: true}).first().click(); await p.waitForTimeout(300);
  await p.getByLabel('Edit the wishlist', {exact: true}).click(); for (let i = 0; i < 2; i++) { await p.getByLabel(/^Take /).first().click(); await p.waitForTimeout(200); }
  await shot('5-wishlist-empty');
  await b.close(); })();
