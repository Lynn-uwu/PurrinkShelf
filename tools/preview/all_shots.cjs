const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots29'); require('fs').mkdirSync(out, {recursive: true});
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = async n => { await p.waitForTimeout(700); await p.screenshot({path: path.join(out, n + '.png')}); console.log(n); };
  const go = async q => { await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=1&state=1' + q); await p.waitForTimeout(13000); };
  const lbl = (t) => p.getByLabel(t, {exact: true}).first();
  try {
  await go('&ao3=1&cal=1');
  if (process.argv[2]) { await lbl('Settings').click(); await p.getByText('Fanfiction (AO3)', {exact: true}).click(); await p.getByText('Separate AO3 library', {exact: true}).click(); await lbl('Close page').last().click(); await p.waitForTimeout(500); } else {
  await lbl('Settings').click(); await shot('a1-settings');
  await p.getByText('Book pages', {exact: true}).click(); await shot('a2-bookpages');
  await lbl('Back').click(); await p.getByText('Filters', {exact: true}).click(); await shot('a3-filters');
  await lbl('Back').click(); await p.getByText('Fanfiction (AO3)', {exact: true}).click(); await shot('a4-ao3');
  await p.getByText('Separate AO3 library', {exact: true}).click();
  await lbl('Back').click(); await p.getByText('Calibre', {exact: true}).click(); await shot('a5-calibre');
  await p.getByText('Changes from Calibre', {exact: true}).click(); await shot('a6-changes');
  await p.getByLabel('Choose: Moon Over the Jade Pavilion').click(); await shot('a7-compare');
  await p.getByText('From Calibre', {exact: true}).click(); await shot('a8-compare-cal');
  await p.getByText('Use Calibre version', {exact: true}).click(); await shot('a9-used');
  await lbl('Back').last().click(); await shot('a10-list-after');
  await lbl('Close page').last().click(); }
  await lbl('Library').click(); await p.waitForTimeout(800); await shot('b1-library');
  await lbl('Tags').click(); await shot('b2-tags');
  await lbl('Jump to a letter').click(); await shot('b3-az');
  await lbl('Letter S').click(); await shot('b4-s');
  await p.getByText('AO3', {exact: true}).last().click(); await shot('b5-ao3lib');
  await p.getByText('Tea for Two (AO3)').first().click(); await shot('b6-ao3book');
  await p.getByLabel('Next', {exact: true}).nth(-2).click(); await shot('b7-ao3book-p2'); await p.getByLabel('Next', {exact: true}).nth(-2).click(); await shot('b8-ao3book-p3');
  } catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('zz-err'); }
  await b.close(); })();
