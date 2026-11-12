// The screenshots in the README (docs/screens), from the preview with made-up demo books.
const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, '..', '..', 'docs', 'screens');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  const tab = n => p.getByTestId('taskbar').getByLabel(n, {exact: true});
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({path: path.join(out, n + '.png')}); };
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1'); await p.waitForTimeout(16000);
  await shot('home');
  await tab('Library').click(); await shot('library');
  await tab('Home').click(); await p.getByText('Moon Over the Jade Pavilion').first().click(); await shot('book');
  await p.getByLabel(/^3 notes/).first().click(); await shot('notes');
  await p.getByLabel('Back to the book', {exact: true}).click(); await p.mouse.click(350, 12); await p.waitForTimeout(300);
  await tab('Collections').click(); await shot('collections');
  await tab('Profile').click(); await shot('profile');
  await b.close(); })();
