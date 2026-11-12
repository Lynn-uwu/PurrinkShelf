const {chromium} = require('playwright'); const path = require('path');
const out = path.join(__dirname, 'shots13');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  const tab = name => p.getByRole('button', {name, exact: true}).last();
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({path: path.join(out, n + '.png')}); console.log('shot', n); };
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&goal=1'); await p.waitForTimeout(14000);
  await tab('Library').click(); await p.waitForTimeout(800);
  await p.getByText('All', {exact: true}).first().click(); await p.waitForTimeout(300); await p.getByText('Paper books', {exact: true}).last().click(); await p.waitForTimeout(500);
  await p.getByText('The Little Prince').first().click(); await p.waitForTimeout(500);
  const nx = p.getByLabel('Next', {exact: true});
  console.log(await nx.count());
  for (let i = 0; i < 3; i++) { await p.mouse.click(235, 877); await p.waitForTimeout(250); }
  await shot('08-paper-details');
  await b.close(); })();
