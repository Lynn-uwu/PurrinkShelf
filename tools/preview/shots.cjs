// Screenshots of InkShelf at Nomad size (1404x1872 shown at half scale).
// Usage: node shots.cjs   (needs Playwright + Chromium). Writes shots/*.png
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
  const arrow = i => p.getByText('›', {exact: true}).nth(i);
  const tab = name => p.getByRole('button', {name, exact: true}).last();

  // first open, adding a library
  await p.goto(url('')); await shot('01-home-first-open');
  await p.getByText('＋ Add library').click(); await shot('02-choose-storage');
  await p.getByText('SD card', {exact: false}).click();
  await p.getByText('▸  Novels').click(); await shot('03-inside-novels');
  await p.getByText('✓  Use this folder').click(); await shot('04-library-list');

  // someone who has been using it
  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(400); await shot('05-home');
  await p.getByPlaceholder('Search titles').fill('the'); await p.waitForTimeout(400); await shot('06-home-search');
  await p.getByPlaceholder('Search titles').fill('');
  await tab('Bookmarks').click(); await shot('07-bookmarks');
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await p.waitForTimeout(500); await shot('08-book');
  await arrow(0).click(); await shot('08b-book-tags');
  await arrow(0).click(); await arrow(0).click().catch(() => {}); await shot('08c-book-details');
  await p.getByText('Bookmarked').click(); await shot('08d-book-unbookmarked');
  await p.getByText('‹ Back').click(); await p.waitForTimeout(200);
  await tab('Library').click(); await p.waitForTimeout(400); await shot('09-library');
  await tab('Settings').click(); await shot('10-settings-sheet');
  await p.getByText('Done').click();
  await p.getByText('Echoes of the Ninth Gate').first().click(); await shot('11-series');
  await p.getByText('▶  Vol 2').click(); await p.waitForTimeout(200);
  console.log('opened:', await p.evaluate(() => window.__opened.join(' | ')));
  await p.getByText('‹ Back').click(); await tab('Home').click(); await shot('12-home-after-reading');
  await b.close();
})();
