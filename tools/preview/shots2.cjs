// Screens for 0.4.0: data and storage, filter sheet, folders, series, missing links, cover picker
const {chromium} = require('playwright');
const path = require('path');
const dir = __dirname, out = path.join(dir, 'shots2');
require('fs').mkdirSync(out, {recursive: true});
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  p.on('console', m => m.type() === 'error' && console.log('CONSOLE:', m.text()));
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({path: path.join(out, n + '.png')}); console.log('shot', n); };
  const url = q => 'file://' + path.join(dir, 'index.html') + q;
  const tab = name => p.getByRole('button', {name, exact: true}).last();
  const L = s => p.getByLabel(s, {exact: true}).first();

  await p.goto(url('')); await p.getByText('Add your first library').click(); await p.waitForTimeout(300); await shot('01-one-sd-card');

  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(900);
  await tab('Library').click(); await p.waitForTimeout(700); await shot('02-library-list');
  await L('Filter, sort and display').click(); await shot('03-sheet-filter');
  await L('Not read yet').click(); await L('Has notes').click(); await L('Has notes').click(); await shot('03b-filter-on');
  await L('Category').click(); await shot('04-sheet-category');
  await L('Historical').click(); await shot('04b-category-on');
  await L('Clear').click().catch(() => {});
  await L('Filter').click(); await L('Clear').click().catch(() => {});
  await L('Tags').click(); await shot('05-sheet-tags');
  await p.getByLabel('Sort', {exact: true}).last().click(); await shot('06-sheet-sort');
  await L('Sort by Date added').click(); await shot('06b-sort-added');
  await L('Sort by Title').click();
  await L('Display').click(); await shot('07-sheet-display');
  await p.getByText(/^Show \d+ book/).click(); await p.waitForTimeout(300);
  await shot('08-library-sorted');
  await L('Grid view').click(); await shot('09-library-grid');
  await L('List view').click();
  await p.getByText('Lotus Court').first().click(); await p.waitForTimeout(500); await shot('10-series-book');
  await L('Back').click();
  await L('Next page').click(); await shot('11-library-p2');
  // folders
  await L('Folder view').click(); await shot('12-folders');
  await L('Open Korean Novels').click(); await shot('13-folder-korean');
  await L('Select books to combine').click();
  await L('Select Salt and Honey').click(); await L('Select Salt and Honey Side Stories').click(); await shot('14-select');
  await p.getByText('Combine 2').click(); await shot('15-name-it');
  await L('Combine').click(); await p.waitForTimeout(500); await shot('16-combined');
  await L('Up one folder').click(); await L('Open Chinese Novels').click(); await shot('17-folder-chinese');
  await L('Open Historical').click(); await shot('18-folder-historical');
  await L('Up one folder').click();
  // missing link
  await L('List view').click(); await p.waitForTimeout(300);
  await L('Filter, sort and display').click(); await L('Next').click(); await L('Missing link').click(); await p.getByText(/^Show \d+ book/).click(); await shot('19-missing-filter');
  await p.getByText('Winter Ferry').first().click(); await p.waitForTimeout(400); await shot('20-missing-book');
  await L('Back').click();
  // data and storage
  await L('Data and storage').click(); await p.waitForTimeout(300); await shot('21-data-storage');
  await L('Remove Books').click(); await shot('22-remove-confirm');
  await L('Keep it').click();
  await L('Missing links').click(); await shot('23-missing-list');
  await L('Back').click().catch(() => {});
  // edit: category + cover
  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(900);
  await tab('Library').click(); await p.waitForTimeout(700);
  await p.getByText('The Last Imperial Tailor').first().click(); await p.waitForTimeout(400); await shot('24-book-category');
  await L('Edit details').click(); await shot('25-edit-category');
  await p.getByText('Choose an image').click(); await p.waitForTimeout(400);
  console.log('picker opened with', JSON.stringify(await p.evaluate(() => window.__picker)));
  await p.mouse.wheel(0, 1200); await shot('26-edit-cover-picked');
  await b.close();
})();
