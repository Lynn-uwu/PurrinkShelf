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
  await p.getByText('＋  Add your first library').click(); await shot('02-choose-storage');
  await p.getByText('SD card', {exact: false}).click();
  await p.getByText('▸  Novels').click(); await shot('03-inside-novels');
  await p.getByText('✓  Use this folder').click(); await shot('04-library-list');

  // someone who has been using it
  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(600); await shot('05-home');
  await p.getByLabel('Search filters').click(); await p.getByPlaceholder('Search titles').fill('the'); await p.waitForTimeout(400); await shot('06-home-search');
  await p.getByPlaceholder('Search titles').fill(''); await p.getByLabel('Search filters').click();
  await p.getByText('View all').nth(1).click(); await shot('06b-genres-view-all');
  await tab('New').click(); await p.waitForTimeout(300); await shot('07-newly-added');
  await p.getByText('Add details').first().click(); await shot('07b-add-details');
  await p.getByText('‹ Cancel').click();
  await tab('Bookmarks').click(); await shot('07c-bookmarks');
  await p.getByText('Moon Over the Jade Pavilion').first().click(); await p.waitForTimeout(500); await shot('08-book');
  await p.getByLabel('3 notes').click(); await shot('08b-notes');
  await p.getByText('Favourite line').click(); await shot('08c-note-2');
  await p.getByText('✎  Edit', {exact: true}).last().click(); await shot('08d-note-edit');
  await p.getByText('Cancel', {exact: true}).click(); await p.getByLabel('Close notes').click();
  await p.getByText('‹ Back').click(); await p.waitForTimeout(200);
  await tab('Library').click(); await p.waitForTimeout(400); await shot('09-library');
  await p.getByText('Crane and the Clockmaker').first().click(); await p.getByLabel('Add a note').click(); await shot('10-notes-empty');
  await p.getByText('Write a note').click(); await shot('10b-note-new');
  await b.close();
})();
