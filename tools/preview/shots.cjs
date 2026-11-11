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
  const open = async () => { await p.goto(url('?lib=2')); await p.waitForTimeout(400); await p.getByText('Novels', {exact: true}).first().click(); await p.waitForTimeout(300); };
  const arrow = i => p.getByText('›', {exact: true}).nth(i);
  await open();
  await p.getByText('Echoes of the Ninth Gate', {exact: false}).first().click(); await shot('07-series-list');
  await p.getByLabel('Grid view').click(); await shot('07b-series-grid');
  await p.getByLabel('List view').click(); await arrow(1).click(); await shot('07c-series-list-page2');
  await p.getByText('‹', {exact: true}).nth(1).click(); await p.getByText('▶  Vol 2').click(); await p.waitForTimeout(200);
  console.log('opened:', await p.evaluate(() => window.__opened.join(' | ')));
  await open();
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await shot('09-book-long');
  await arrow(0).click(); await shot('09b-book-left-page2');
  await arrow(1).click(); await shot('09c-book-right-page2');
  for (let i = 0; i < 4; i++) await arrow(0).click().catch(() => {});
  await shot('09d-book-details');
  await p.getByText('✎ Edit').click(); await shot('08-edit');
  await p.mouse.move(350, 500); await p.mouse.wheel(0, 1100); await shot('08b-edit-lower');
  await p.getByText('‹ Cancel').click(); await p.getByText('‹ Back').click(); await p.waitForTimeout(200);
  await p.getByText('Novels ▾').click(); await p.getByText('Settings', {exact: true}).last().click(); await shot('10-settings');
  await p.getByText('Scroll up and down').click(); await p.getByText('‹ Back').click(); await p.waitForTimeout(200);
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await shot('11-book-scroll-mode');
  await p.getByText('‹ Back').click(); await p.getByText('Tags', {exact: true}).click(); await shot('12-filter-tags');
  await b.close();
})();
