// Records a walkthrough of every InkShelf screen: before/after screenshots of each tap, with captions.
const {chromium} = require('playwright'); const path = require('path'); const fs = require('fs');
const out = process.argv[2]; fs.mkdirSync(out, {recursive: true});
const steps = []; let n = 0; let chapter = '';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const U = q => 'file://' + path.join(__dirname, 'index.html') + q;
  const snap = async () => { const f = `f${String(++n).padStart(3, '0')}.jpg`; await p.screenshot({path: path.join(out, f), type: 'jpeg', quality: 92}); return f; };
  const ch = t => (chapter = t);
  const L = s => p.getByLabel(s, {exact: true}).first();
  const T = (s, last) => (last ? p.getByText(s, {exact: true}).last() : p.getByText(s, {exact: true}).first());
  // show the screen as it is
  const show = async (caption, dur = 3.2) => { await p.waitForTimeout(450); steps.push({img: await snap(), caption, chapter, dur}); };
  // point at something, tap it, show the result
  const tap = async (loc, caption, dur = 3.0, how) => {
    try {
      await loc.waitFor({timeout: 4000});
      const bb = await loc.boundingBox();
      steps.push({img: await snap(), caption, chapter, dur: 1.1, ring: bb});
      if (how) await how(); else await loc.click();
      await p.waitForTimeout(500);
      steps.push({img: await snap(), caption, chapter, dur});
    } catch (e) { console.log('SKIP', caption, String(e).split('\n')[0]); }
  };
  const type = async (loc, text, caption, dur = 3.0) => {
    try { await loc.waitFor({timeout: 4000}); const bb = await loc.boundingBox(); steps.push({img: await snap(), caption, chapter, dur: 1.0, ring: bb}); await loc.fill(text); await p.waitForTimeout(500); steps.push({img: await snap(), caption, chapter, dur}); } catch (e) { console.log('SKIP', caption, String(e).split('\n')[0]); }
  };
  // a drawn card (how to open InkShelf, a laptop with the sheet…) shown like a screen
  const pg2 = await b.newPage({viewport: {width: 702, height: 936}, deviceScaleFactor: 2});
  const card = async (html, caption, dur = 4.2) => {
    await pg2.setContent(`<html><head><style>body{margin:0;width:702px;height:936px;font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f1ea;color:#111;overflow:hidden}
      .wrap{padding:44px 40px}.ht{font-size:30px;font-weight:700;margin:0 0 18px}.p{font-size:20px;line-height:1.45;margin:0 0 14px}.dev{border:3px solid #222;border-radius:26px;background:#fff;padding:18px;margin:22px auto;width:470px}
      .tb{display:flex;gap:10px;justify-content:flex-end;border-bottom:2px solid #222;padding-bottom:10px}.ic{width:40px;height:40px;border:2px solid #222;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
      .ic.on{background:#e8590c;color:#fff;border-color:#e8590c}.pg{height:190px;background:repeating-linear-gradient(#fff,#fff 26px,#ddd 27px);margin-top:12px}
      .lap{margin:20px auto 0;width:640px}.scr{border:14px solid #222;border-bottom-width:18px;border-radius:14px 14px 0 0;background:#fff;height:560px;overflow:hidden}.base{height:16px;background:#bbb;border-radius:0 0 18px 18px;margin:0 -26px}
      .bar{background:#217346;color:#fff;padding:6px 10px;font-size:12px}.fx{font-size:11px;border-bottom:1px solid #ccc;padding:4px 8px;color:#333}
      table{border-collapse:collapse;font-size:12px;table-layout:fixed;width:100%}th{background:#f3f3f3;border:1px solid #d4d4d4;font-weight:normal;color:#555;height:16px}
      td{border:1px solid #e3e3e3;height:24px;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}td.n{background:#f3f3f3;color:#555;text-align:center;width:20px}td.h{font-weight:bold;background:#e8f1ea}
      td.s{outline:2px solid #217346;outline-offset:-2px;overflow:visible}td.new{background:#fff6d6}.drop{position:absolute;left:-2px;top:24px;width:130px;background:#fff;border:1px solid #888;box-shadow:2px 3px 8px rgba(0,0,0,.25);z-index:9}
      .opt{padding:2px 6px}.opt.on{background:#cfe3d6}.steps{font-size:19px;line-height:1.5;padding-left:26px}.steps li{margin-bottom:10px}
      </style></head><body>${html}</body></html>`);
    await pg2.waitForTimeout(150);
    const f = `f${String(++n).padStart(3, '0')}.jpg`; await pg2.screenshot({path: path.join(out, f), type: 'jpeg', quality: 92});
    steps.push({img: f, caption, chapter, dur});
  };
  // the sheet InkShelf wrote (.xlsx entries): rows of cells, by reading its inline strings
  const sheetRows = xml => (xml.match(/<row\b[\s\S]*?<\/row>/g) || []).map(r => { const o = {}; for (const c of r.matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/g)) o[c[1]] = (c[2] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); return o; });
  const laptop = (rows, cols, opts) => {
    const head = rows[0];
    const letter = h => Object.keys(head).find(k => head[k] === h);
    const L = cols.map(letter);
    const body = rows.slice(0, 18).map((r, i) => `<tr><td class=n>${i + 1}</td>${L.map((k, j) => {
      const sel = opts.sel && opts.sel[0] === i && opts.sel[1] === cols[j];
      const isNew = opts.edited && opts.edited.some(e => e[0] === i && e[1] === cols[j]);
      const v = (opts.override && opts.override[i + ',' + cols[j]]) || r[k] || '';
      return `<td class="${i === 0 ? 'h' : ''} ${sel ? 's' : ''} ${isNew ? 'new' : ''}">${v.replace(/</g, '&lt;')}${sel && opts.drop ? `<div class=drop>${opts.drop.map(o => `<div class="opt ${o === opts.pick ? 'on' : ''}">${o}</div>`).join('')}</div>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class=lap><div class=scr><div class=bar>InkShelf books.xlsx — Excel / Google Sheets</div><div class=fx>${opts.fx || ''}</div><table><colgroup><col style="width:20px">${cols.map(c => `<col style="width:${c === 'Description' ? 210 : c === 'Title' ? 150 : 80}px">`).join('')}</colgroup><tr><th></th>${L.map(k => `<th>${k}</th>`).join('')}</tr>${body}</table></div><div class=base></div></div>`;
  };
  const quiet = async () => { await p.waitForTimeout(5200); }; // let messages clear
  const outside = () => p.mouse.click(350, 12);
  const inside = () => p.mouse.click(560, 260); // on the book card's description: closes a sheet inside the card
  // the left page arrow on the book card
  const leftNext = async () => { const all = p.getByLabel('Next', {exact: true}); const n = await all.count(); for (let i = 0; i < n; i++) { const bb = await all.nth(i).boundingBox(); if (bb && bb.x < 300 && bb.y > 840 && (await all.nth(i).isEnabled())) return all.nth(i); } return all.last(); };
  // a taskbar tab (the bottom row), not a button with the same name on a card
  const tab = name => p.getByTestId('taskbar').getByLabel(name, {exact: true});

  await p.goto(U('?lib=2&state=1&reading=1&goal=1')); await p.waitForTimeout(1600);
  ch('Getting started');
  await card(`<div class=wrap><p class=ht>Opening InkShelf</p><p class=p>Plugins live inside Supernote's toolbar, so open any book or note first, then tap the InkShelf button in the toolbar.</p>
    <div class=dev><div class=tb><div class=ic>✎</div><div class=ic>⌫</div><div class="ic on">▥</div><div class=ic>⋯</div></div><div class=pg></div></div>
    <p class=p>If that file is one of your books, InkShelf notes it as the one you are reading (Continue, reading days).</p></div>`, 'Open any book or note, then tap the InkShelf button in its toolbar.', 5);
  ch('Home');
  await show('Opening InkShelf from a book also notes which book you are reading. Messages are see-through and stack up.', 3.6);
  await quiet(); await quiet();
  await show('Home: search, recent searches, recently read and genres.');
  await type(p.getByPlaceholder('Search titles'), 'moon', 'Search any title in every library.');
  await p.getByPlaceholder('Search titles').fill(''); await p.keyboard.press('Escape').catch(() => {});
  await tab('Home').click(); await p.waitForTimeout(400);
  await tap(L('Next').first(), 'Arrows turn the pages of each row (no scrolling needed).');

  ch('Add a library folder');
  await tap(L('Settings'), 'To choose where your books are: the gear opens Settings.');
  await tap(T('Data and storage'), 'Data and storage lists your library folders.');
  await tap(L('Add a library folder'), 'The folder button adds one.');
  await tap(T('SD card').first(), 'Pick Supernote or the SD card…');
  await tap(T('Novels'), '…open folders until you reach the one that holds your books.');
  await show('Tap "Use this folder". Every book inside is found, subfolders too, and your subfolders become categories.', 4.2);
  await L('Cancel').click().catch(() => {}); await p.waitForTimeout(400);
  if (await p.getByText('Data and storage', {exact: true}).count()) { await outside(); await p.waitForTimeout(300); }
  await outside(); await p.waitForTimeout(300);
  await tab('Home').click().catch(() => {}); await p.waitForTimeout(300);

  ch('Library');
  await tap(tab('Library'), 'The Library tab: every book, with the filter panel on the left.');
  await tap(p.getByLabel('Choose a category').first(), 'Tap the name at the top to pick a category. Sub-categories sit under their parent.');
  await tap(T('Korean Novels', true), 'Only that category is shown.');
  await tap(p.getByLabel('Choose a category').first(), 'Back to everything:');
  await tap(T('All', true), 'All books again.');
  await tap(T('Romance'), 'Tap a genre once to include it, again to leave it out.');
  await tap(T('Romance'), 'Crossed out: books with this genre are hidden.');
  await tap(T('Clear'), 'Clear removes every filter.');
  await tap(p.getByLabel('Author', {exact: true}).first(), 'The Author tab lists everyone who wrote your books.');
  await tap(p.getByLabel('Content warnings').first(), 'Content warnings have their own tab (they can be hidden in Settings).');
  await tap(p.getByLabel('More filters').first(), 'More: not read yet, favourite, in progress, rated, duplicates, paper or e-book…');
  await tap(p.getByLabel('Genre', {exact: true}).first(), 'Back to genres.');
  await tap(p.getByLabel('Sort').first(), 'Tap the book count to sort: title, last read, date added, author, your rating…');
  await outside(); await p.waitForTimeout(300);
  await tap(p.getByLabel('Grid view').first().or(p.locator('[aria-label="Covers"]').first()), 'Covers view.');
  await tap(L('Folder view'), 'Folder view: your folders as they are on the card.');
  await tap(L('Folder view'), 'And back to the list.');
  await tap(L('Add a book'), 'The + adds a book. E-book: one you will copy in later. It goes on your wishlist and waits in New.');
  await type(p.getByPlaceholder('The book you want to add'), 'The Glass Orchard', 'Type the title; the author and where to get it are optional.');
  await tap(L('Paper book'), 'Paper book: one on your shelf, kept in its own Paper books folder.');
  await type(p.getByPlaceholder('The book on your shelf'), 'Norwegian Wood', 'It then works like any book: cover, notes, status, lending.');
  await tap(p.getByLabel('Cancel', {exact: true}).last(), '(Cancelled for this walkthrough.)', 2.0);

  ch('A book');
  await tap(T('Echoes of the Ninth Gate'), 'Tap a book: its page opens as a card over the list.');
  await tap(L('Reading status'), 'Your reading status, with the date of every change.');
  await inside(); await p.waitForTimeout(300);
  await show('Start opens the book; after that it says Continue and opens the volume you had open.');
  await tap(await leftNext(), 'Arrows turn the left side: Overview, Tags, Details.');
  await tap(await leftNext(), 'Details: categories, your rating, reading history…');
  await tap(p.getByLabel('Collections', {exact: true}).last(), 'Add the book to your collections.');
  await inside(); await p.waitForTimeout(300);
  await tap(L('Paste into note'), 'Paste the cover or details into the note you have open.');
  await inside(); await p.waitForTimeout(300);
  await tap(L('Check this book\'s files again'), 'Check this book\'s files again (added, deleted or renamed volumes).');
  await tap(L('Edit details'), 'The pencil edits everything: title, author, categories, genres, tags…');
  await p.mouse.move(350, 600); await p.mouse.wheel(0, 900); await show('…content warnings, series, description, language, status…');
  await p.mouse.wheel(0, 1000); await show('…where you got it, lent or borrowed, and the cover (with the best size in mm).');
  await p.mouse.wheel(0, 1000); await show('If the details joined the wrong file, link them to the right one here.');
  await outside(); await p.waitForTimeout(400); await show('Tapping outside closes one layer: back to the book.', 2.6);
  await outside(); await p.waitForTimeout(400);

  ch('Notes and ratings');
  await tab('Home').click(); await p.waitForTimeout(300);
  await tap(T('Moon Over the Jade Pavilion'), 'A book with notes: the sticky note on the cover shows how many.');
  await tap(p.getByLabel(/^3 notes/).first(), 'All its notes, pinned on a board, a little crooked like real ones.');
  await tap(p.getByLabel(/^Note 3:/).first(), 'Tap one to change it. Each note can carry your 1–5 star rating.');
  await tap(p.getByLabel('4 stars').first(), 'The book\'s rating is the average of its notes.');
  await tap(p.getByLabel('Cancel', {exact: true}).last(), 'Cancel leaves the note as it was.', 1.8);
  await tap(L('Choose notes to delete'), 'To delete: tap the bin, pick the notes, then ✓. ✕ cancels.');
  await tap(L('Cancel deleting'), 'Cancelled.', 1.6);
  await tap(L('Back to the book'), 'Back to the book.', 1.6);
  await outside(); await p.waitForTimeout(300);

  ch('Duplicates');
  await tap(T('Rain Over Busan'), 'Same name in the same folder twice? The book page says so.');
  await show('Open files takes you to the file manager to delete one yourself. Keep both leaves a small 2× mark that jumps to the other copy.', 4);
  await outside(); await p.waitForTimeout(300);

  ch('Newly added');
  await tap(tab('Newly added'), 'New: books found since you last looked, and books still missing details. The dashed bar lists wishlist books not here yet.');

  ch('Collections');
  await tap(tab('Collections'), 'Collections: bookmarks, favourites, in progress, completed, yours, and the wishlist.');
  await tap(T('Completed'), 'Open one to see its books.');
  await tap(p.getByLabel('Choose a collection').first(), 'The name at the top switches collection.');
  await p.getByLabel('Choose a collection').first().click(); await p.waitForTimeout(300);
  await tap(p.getByLabel(/^Edit /).first(), 'Edit mode: ✕ takes a book out; Rules and name changes the collection.');
  await tap(L('All collections'), 'Back to all collections.');
  await tap(L('New collection'), 'Make your own: add rules like "Genre is Romance" and matching books join by themselves.');
  await tap(T('Add a rule'), 'Each rule: what to check, is / is not, and a value picked from a drop-down.');
  await tap(T('choose…', true).or(p.getByText(/choose/).last()), 'The values open right under the rule; the rest is dimmed.');
  await p.mouse.click(30, 30); await p.waitForTimeout(300);
  for (const t of ['Discard', 'Leave without saving', "Don't save"]) if (await p.getByText(t).count()) { await p.getByText(t).first().click(); break; }
  await p.waitForTimeout(300);
  if (!(await tab('Collections').count())) { await p.mouse.click(30, 30); await p.waitForTimeout(300); }
  await tab('Collections').click(); await p.waitForTimeout(400);
  await tap(T('Wishlist'), 'The wishlist: books you want but don\'t have yet.');
  await tap(L('Add a book to the wishlist'), 'When a book with the same name turns up, it comes off the list and your note is pinned on it.');
  await p.getByLabel('Cancel', {exact: true}).last().click().catch(() => {}); await p.waitForTimeout(300);

  ch('Profile');
  await tap(tab('Profile'), 'Profile: your reading in numbers, goal, time spent, reading days and top genres.');
  await tap(L('Notes and quotes'), 'Every note from every book on one board.');
  await type(p.getByPlaceholder('Search your notes and quotes'), 'line', 'Search them; tap one to open its book.');
  await tab('Profile').click(); await p.waitForTimeout(300);

  ch('Settings');
  await tap(L('Settings'), 'The gear opens Settings. Every change applies straight away.');
  await tap(T('Show on Profile').locator('..').getByText(/Reading goal/).first().or(p.getByText(/Reading goal/).last()), 'Tap to show or hide each part of the Profile (here the reading goal goes off).');
  await tap(T('Activity'), 'Activity keeps every message, so nothing is missed.');
  await outside(); await p.waitForTimeout(300);
  await tap(T('Data and storage'), 'Data and storage: your libraries, refresh, leave folders out.');
  await tap(T('Backup and sheet'), 'Automatic backup, the spreadsheet for a computer, and Goodreads / StoryGraph files.');
  await tap(p.getByText(/^Missing books/).first(), 'What happens when a book\'s file disappears.');
  await outside(); await p.waitForTimeout(300); await show('Tapping outside goes back to Settings, one layer at a time.', 2.6);
  ch('On a computer');
  await tap(T('Data and storage'), 'Filling in many books is quicker on a computer.');
  await tap(T('Backup and sheet'), 'Backup and sheet:');
  await tap(T('Make the sheet'), 'Make the sheet saves Document › InkShelf › InkShelf books.xlsx with every book.');
  const zipPath = '/storage/emulated/0/Document/InkShelf/InkShelf books.xlsx';
  const entries = await p.evaluate(pth => window.__files[pth], zipPath);
  if (entries) {
    const rows = sheetRows(entries['xl/worksheets/sheet1.xml']);
    const listRows = sheetRows(entries['xl/worksheets/sheet3.xml']);
    const lh = listRows[0]; const gk = Object.keys(lh).find(k => lh[k] === 'Genres');
    const genres = listRows.slice(1).map(r => r[gk]).filter(Boolean).slice(0, 9);
    const cols = ['Title', 'Genre 1', 'Tag 1', 'Reading', 'Description'];
    const crane = rows.findIndex(r => Object.values(r).includes('Crane and the Clockmaker'));
    await card(`<div class=wrap><p class=ht>Copy it to your computer</p><ol class=steps><li>Connect the Supernote by USB, or use Supernote Cloud / Browse &amp; Access.</li><li>Open <b>Document › InkShelf › InkShelf books.xlsx</b> in Excel, Google Sheets or Numbers.</li><li>Fill in what you like, save, and copy it back to the same place.</li></ol></div>`, 'Copy the file to your computer (USB, Supernote Cloud or Browse & Access).', 4.6);
    await card(`<div class=wrap><p class=ht>Pick, don't type</p></div>` + laptop(rows, cols, {sel: [crane, 'Genre 1'], drop: genres, pick: genres[2], fx: 'Genre 1'}), 'Every genre, tag, category, status and collection is a drop-down, so you pick instead of typing.', 4.6);
    const desc = 'An apprentice clockmaker repairs a crane made of brass, and it starts telling her the town\'s secrets.';
    await card(`<div class=wrap><p class=ht>Descriptions the easy way</p></div>` + laptop(rows, cols, {sel: [crane, 'Description'], edited: [[crane, 'Genre 1'], [crane, 'Description']], override: {[crane + ',Genre 1']: genres[2], [crane + ',Description']: desc}, fx: desc}), 'Paste descriptions from anywhere into the Description column. Leave a cell empty to keep it; "-" clears it.', 5);
    // the edited sheet goes back to the Supernote
    const head = rows[0]; const k = h => Object.keys(head).find(x => head[x] === h);
    const rowNo = crane + 1;
    const xml = entries['xl/worksheets/sheet1.xml'].replace(new RegExp(`(<row r="${rowNo}"[^>]*>[\\s\\S]*?)(</row>)`), (m, a, z) => a + `<c r="${k('Genre 1')}${rowNo}" t="inlineStr"><is><t>${genres[2]}</t></is></c><c r="${k('Description')}${rowNo}" t="inlineStr"><is><t>${desc}</t></is></c>` + z);
    await p.evaluate(([pth, x]) => { window.__files[pth] = {...window.__files[pth], 'xl/worksheets/sheet1.xml': x}; (window.__mt = window.__mt || {})[pth] = Date.now() + 10000; }, [zipPath, xml]);
    await tap(T('Read changes now'), 'Back on the Supernote: Read changes now (it also reads them by itself when InkShelf opens).', 3.4);
    if (await p.getByLabel('OK', {exact: true}).count()) { await p.getByLabel('OK', {exact: true}).first().click(); await p.waitForTimeout(300); }
    await quiet();
  }
  await tap(T('Make a file for them'), 'Goodreads and StoryGraph: make a file both sites can import…');
  await tap(T('Import their file'), '…or bring in their export: status, dates, ratings and reviews; books you lack go on the wishlist.', 4.2);
  for (let i = 0; i < 2; i++) if (await p.getByLabel('OK', {exact: true}).count()) { await p.getByLabel('OK', {exact: true}).first().click(); await p.waitForTimeout(300); }
  await outside(); await p.waitForTimeout(400);
  if (await p.getByText('Show on Profile').count()) { await outside(); await p.waitForTimeout(400); }
  await tab('Library').click(); await p.waitForTimeout(500);
  await tap(T('Crane and the Clockmaker'), 'The book now has the genre and description from the sheet.', 3.6);
  await outside(); await p.waitForTimeout(300);
  await tab('Profile').click(); await p.waitForTimeout(300);
  await L('Settings').click(); await p.waitForTimeout(300);

  ch('Help');
  await tap(T('How to use'), 'How to use: short guides with search.');
  await type(p.getByPlaceholder(/Search/).first(), 'paper', 'Search the guides.');
  await tap(T('Paper books'), 'Each guide is a few steps.');
  await show('That\'s InkShelf.', 2.5);
  fs.writeFileSync(path.join(out, 'steps.json'), JSON.stringify(steps, null, 1));
  console.log('steps', steps.length, 'seconds', steps.reduce((a, s) => a + s.dur, 0).toFixed(0));
  await b.close();
})();
