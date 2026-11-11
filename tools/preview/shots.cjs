// Screenshots of InkShelf's main screens at Nomad size (1404x1872 shown at half scale).
// Usage: node shots.cjs   (needs Playwright + Chromium)
const {chromium} = require('playwright');
const path = require('path');
const dir = __dirname, out = path.join(dir, 'shots');
require('fs').mkdirSync(out, {recursive: true});
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = async n => { await p.waitForTimeout(350); await p.screenshot({path: path.join(out, n + '.png')}); console.log('shot', n); };
  const url = q => 'file://' + path.join(dir, 'index.html') + q;

  await p.goto(url('')); await shot('01-libraries-empty');
  await p.getByText('＋  Add a library folder').click(); await shot('02-choose-storage');
  await p.getByText('SD card', {exact: false}).click(); await shot('03-folder-browser');
  await p.getByText('▸  Novels').click(); await shot('04-inside-novels');
  await p.getByText('✓  Use this folder').click(); await shot('05-library-list');
  await p.getByLabel('Grid view').click(); await shot('05b-library-grid');
  await p.getByLabel('List view').click();
  await p.getByText('Romance', {exact: true}).first().click(); await shot('06-filtered-romance');
  await p.getByText('Clear').click();
  await p.locator('div[tabindex="0"]').filter({hasText: /^$/}).nth(1).click().catch(() => {});
  await p.goto(url('?lib=2')); await p.waitForTimeout(400);
  await p.getByText('Novels', {exact: true}).first().click(); await p.waitForTimeout(300);
  const icons = p.locator('div[tabindex="0"]').filter({has: p.locator('div')});
  await p.evaluate(() => {}); 
  await p.getByText('Echoes of the Ninth Gate', {exact: false}).first().click(); await shot('07-book-series');
  await p.getByText('▶  Vol 2').click(); await p.waitForTimeout(200);
  console.log('opened:', await p.evaluate(() => window.__opened.join(' | ')));
  await p.goto(url('?lib=2')); await p.waitForTimeout(400);
  await p.getByText('Novels', {exact: true}).first().click(); await p.waitForTimeout(300);
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await p.waitForTimeout(200);
  await p.getByText('✎  Edit title, tags, description, cover').click(); await shot('08-edit');
  await b.close();
})();
