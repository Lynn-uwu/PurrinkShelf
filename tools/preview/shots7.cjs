const {chromium} = require('playwright');
const path = require('path');
const fs = require('fs');
const dir = __dirname, out = path.join(dir, 'shots7');
fs.mkdirSync(out, {recursive: true});
const CSV = '/storage/emulated/0/Document/InkShelf/InkShelf books.csv';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({path: path.join(out, n + '.png')}); console.log('shot', n); };
  const url = q => 'file://' + path.join(dir, 'index.html') + q;
  const L = s => p.getByLabel(s, {exact: true}).first();
  const tab = name => p.getByRole('button', {name, exact: true}).last();
  await p.goto(url('?lib=2&state=1')); await p.waitForTimeout(900);
  await tab('Library').click(); await p.waitForTimeout(6000);
  await L('Data and storage').click(); await shot('01-data-card');
  await L('Close page').click(); await shot('02-closed-back-to-library');
  await L('Choose a category').click(); await shot('03-category');
  await L('Close').click();
  // the sheet
  await L('Data and storage').click(); await L('Backup and sheet').click(); await p.getByText('Make the sheet').click(); await p.waitForTimeout(500);
  const csv = await p.evaluate(f => window.__files[f], CSV);
  fs.writeFileSync(path.join(out, 'sheet.csv'), csv);
  // pretend the reader filled it in on a computer
  const edited = await p.evaluate(f => {
    const t = window.__files[f];
    const lines = t.split('\r\n');
    const i = lines.findIndex(l => l.startsWith('Crane and the Clockmaker'));
    const cols = lines[i].split(',');
    // Title,Library,Folder,File,Categories,Genres,Tags,Language,Status,Translated,Reading,Favourite,Description,ID
    cols[5] = '"Fantasy, Romance"'; cols[6] = '"Clockwork, Slow burn"'; cols[7] = 'Chinese'; cols[8] = '62 Chapters (Completed)'; cols[9] = 'Yes'; cols[10] = 'Completed'; cols[11] = 'Yes';
    cols[12] = '"A crane spirit apprentices herself to a stubborn clockmaker."';
    lines[i] = cols.join(',');
    window.__files[f] = lines.join('\r\n');
    return window.__files[f];
  }, CSV);
  fs.writeFileSync(path.join(out, 'sheet-edited.csv'), edited);
  await p.getByText('Read changes now').click(); await p.waitForTimeout(500); await shot('04-read-changes');
  await L('Close page').click();
  await p.getByText('Crane and the Clockmaker').first().click(); await p.waitForTimeout(500); await shot('05-book-after-sheet');
  await L('Close page').click();
  // collections
  await tab('Collections').click(); await L('New collection').click(); await shot('06-new-collection');
  await p.getByPlaceholder('e.g. Cosy reads, To reread, Book club').fill('Finished romances');
  await p.getByText('Add a rule').click(); await shot('07-rule-added');
  await L('Rule field').click(); await shot('08-pick-field');
  await p.getByText('Reading status', {exact: true}).last().click();
  await L('Rule value').click(); await shot('09-pick-status');
  await p.getByText('Completed', {exact: true}).last().click();
  await p.getByText('Add a rule').click();
  await p.getByLabel('Rule value', {exact: true}).nth(1).click(); await p.getByText('Romance', {exact: true}).last().click();
  await p.getByText('Add a rule').click();
  await p.getByLabel('Rule field', {exact: true}).nth(2).click(); await p.getByText('Tag', {exact: true}).last().click();
  await p.getByLabel('Include or exclude', {exact: true}).nth(2).click();
  await p.getByLabel('Rule value', {exact: true}).nth(2).click(); await shot('10-pick-tag');
  await p.getByText('Court Politics', {exact: true}).last().click(); await shot('11-three-rules');
  await p.getByText('any of these fits').click(); await shot('12-any');
  await p.getByText('all of these fit').click();
  await p.getByText('Save collection').click(); await shot('13-collection');
  await b.close();
})();
