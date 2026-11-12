const {chromium} = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}});
  await p.goto('file://' + path.join(__dirname, 'index.html') + '?lib=2&state=1&reading=1'); await p.waitForTimeout(6500);
  await p.getByRole('button', {name: 'Library', exact: true}).last().click(); await p.waitForTimeout(800);
  console.log(await p.getByText('Min Seo', {exact: true}).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [r.x, r.y, r.width, r.height, cs.color, cs.opacity, cs.display]; })));
  await b.close(); })();
