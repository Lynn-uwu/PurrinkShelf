const {chromium} = require('playwright'); const path = require('path'); const fs = require('fs');
const out = path.join(__dirname, 'shots10'); fs.mkdirSync(out, {recursive: true});
const X = '/storage/emulated/0/Document/InkShelf/InkShelf books.xlsx';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  p.on('console', m => m.text().includes('sheet') && console.log(m.text().slice(0, 300)));
  const L = s => p.getByLabel(s, {exact: true}).first();
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({path: path.join(out, n + '.png')}); console.log('shot', n); };
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1'); await p.waitForTimeout(1500);
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(6000);
  await L('Data and storage').click(); await L('Backup and sheet').click(); await p.getByText('Make the sheet').click(); await p.waitForTimeout(600);
  const files = await p.evaluate(x => window.__files[x], X);
  fs.writeFileSync(path.join(out, 'entries.json'), JSON.stringify(files));
  // laptop edits: replace the sheet xml with an edited one made by python (entries-edited.json), if present
  if (fs.existsSync(path.join(out, 'entries-edited.json'))) {
    const ed = JSON.parse(fs.readFileSync(path.join(out, 'entries-edited.json'), 'utf8'));
    await p.evaluate(([x, e]) => { window.__files[x] = e; window.__mt[x] = Date.now() + 60000; }, [X, ed]);
    await p.getByText('Read changes now').click(); await p.waitForTimeout(800); await shot('01-read');
    await L('Close page').click();
    await p.getByText('Crane and the Clockmaker').first().click(); await p.waitForTimeout(500); await shot('02-book');
    await L('Close page').click();
    await p.getByRole('button', {name: 'Collections', exact: true}).last().click(); await p.waitForTimeout(800); await shot('03-collections');
  }
  await b.close(); })();
