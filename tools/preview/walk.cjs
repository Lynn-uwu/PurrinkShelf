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
  const quiet = async () => { await p.waitForTimeout(5200); }; // let messages clear
  const outside = () => p.mouse.click(350, 12);
  const inside = () => p.mouse.click(560, 260); // on the book card's description: closes a sheet inside the card
  // the left page arrow on the book card
  const leftNext = async () => { const all = p.getByLabel('Next', {exact: true}); const n = await all.count(); for (let i = 0; i < n; i++) { const bb = await all.nth(i).boundingBox(); if (bb && bb.x < 300 && bb.y > 840 && (await all.nth(i).isEnabled())) return all.nth(i); } return all.last(); };
  // a taskbar tab (the bottom row), not a button with the same name on a card
  const tab = name => p.getByTestId('taskbar').getByLabel(name, {exact: true});

  await p.goto(U('?lib=2&state=1&reading=1&goal=1')); await p.waitForTimeout(1600);
  ch('Home');
  await show('Opening InkShelf from a book also notes which book you are reading. Messages are see-through and stack up.', 3.6);
  await quiet(); await quiet();
  await show('Home: search, recent searches, recently read and genres.');
  await type(p.getByPlaceholder('Search titles'), 'moon', 'Search any title in every library.');
  await p.getByPlaceholder('Search titles').fill(''); await p.keyboard.press('Escape').catch(() => {});
  await tab('Home').click(); await p.waitForTimeout(400);
  await tap(L('Next').first(), 'Arrows turn the pages of each row (no scrolling needed).');

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
  await tap(L('Add a paper book'), 'The + adds a paper book, kept in its own Paper books folder.');
  await type(p.getByPlaceholder('The book on your shelf'), 'Norwegian Wood', 'Type the title (the author is optional).');
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
  await tap(tab('Newly added'), 'New: books found since you last looked, and books still missing details.');

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
  await tap(T('How to use'), 'How to use: short guides with search.');
  await type(p.getByPlaceholder(/Search/).first(), 'paper', 'Search the guides.');
  await tap(T('Paper books'), 'Each guide is a few steps.');
  await show('That\'s InkShelf.', 2.5);
  fs.writeFileSync(path.join(out, 'steps.json'), JSON.stringify(steps, null, 1));
  console.log('steps', steps.length, 'seconds', steps.reduce((a, s) => a + s.dur, 0).toFixed(0));
  await b.close();
})();
