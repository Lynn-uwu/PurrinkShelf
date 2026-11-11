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
  await p.getByText('Add your first library').click(); await p.waitForTimeout(300); await shot('02-which-folder');
  await p.getByText('Browse folders instead').click(); await shot('02b-browse-fallback');
  await p.getByLabel('Cancel').click();
  await p.getByText('Add your first library').click(); await p.waitForTimeout(300);
  await p.getByText('Novels', {exact: true}).click(); await p.waitForTimeout(400); await shot('04-library-list');

  // someone who has been using it
  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(600); await shot('05-home');
  await p.getByLabel('Search filters').click(); await p.getByPlaceholder('Search titles').fill('the'); await p.waitForTimeout(400); await shot('06-search-list');
  await p.getByLabel('Grid view').click(); await shot('06b-search-grid');
  await p.getByPlaceholder('Search titles').fill(''); await p.getByLabel('Search filters').click();
  await p.getByLabel('View all').nth(1).click(); await shot('07-genres-grid');
  await p.getByLabel('List view').click(); await shot('07b-genres-list');
  await tab('Newly added').click(); await p.waitForTimeout(300); await shot('08-new-list');
  await p.getByLabel('Grid view').click(); await shot('08b-new-grid');
  await tab('Bookmarks').click(); await shot('09-bookmarks');
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await p.waitForTimeout(500); await shot('10-book');
  await p.getByLabel('Hold to paste into your note').click({delay: 700}); await shot('11-paste-sheet');
  await p.getByLabel('Cover + details').click(); await p.waitForTimeout(500);
  console.log('pasted:', await p.evaluate(() => window.__pasted.join(' | ')));
  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(600);
  await tab('Bookmarks').click(); await p.getByText('Moon Over the Jade Pavilion').first().click(); await p.waitForTimeout(400);
  await p.getByLabel('3 notes').click(); await shot('12-notes');
  await p.getByLabel('Delete note').click(); await shot('12b-notes-delete-confirm');
  await p.getByLabel('Edit note').click(); await shot('12c-note-edit');
  await p.getByLabel('Close notes').click();
  await p.getByLabel('Back').click(); await p.waitForTimeout(200);
  await tab('Library').click(); await p.waitForTimeout(400); await shot('13-library');
  await tab('Settings').click(); await shot('14-settings');
  await b.close();
})();
