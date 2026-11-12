// A pretend Supernote for previews: a small fake SD card with demo books,
// plus stand-ins for the plugin kit and InkShelf's native module.
// All titles and covers here are made up for testing.
import {NativeModules} from 'react-native-web';

const SD = '/storage/ABCD-1234';
const tree = {
  '/storage': ['emulated/', 'self/', 'ABCD-1234/'],
  [`${SD}`]: ['Novels/', 'Books/', 'Music/'],
  '/storage/emulated/0': ['Document/', 'Note/', 'MyStyle/', 'SCREENSHOT/'],
  '/storage/emulated/0/SCREENSHOT': ['20261110_201533.png'],
  '/storage/emulated/0/Document': ['Welcome.pdf'],
  [`${SD}/Books`]: ['Garden Notes.epub'],
  [`${SD}/Music`]: [],
  [`${SD}/Novels`]: ['Chinese Novels/', 'Korean Novels/', 'Calibre/', 'Paper books/', '_Library Data/'],
  [`${SD}/Novels/Calibre`]: ['Leviathan Wakes (12)/'],
  [`${SD}/Novels/Calibre/Leviathan Wakes (12)`]: ['Leviathan Wakes - James S. A. Corey.epub', 'metadata.opf', 'cover.jpg'],
  [`${SD}/Novels/Paper books`]: ['The Little Prince.paper'],
  [`${SD}/Novels/Korean Novels`]: ['The Lighthouse Keeper - Min Seo.epub', 'Rain Over Busan.epub', 'Rain Over Busan (1).epub', 'Salt and Honey.epub', 'Salt and Honey Side Stories.epub'],
  [`${SD}/Novels/Chinese Novels`]: [
    'Moon Over the Jade Pavilion.epub', 'The Tea House on Willow Street.epub', 'A Sword Without a Name.epub',
    'Paper Lanterns in Winter.epub', 'The Fox Who Kept the Library.epub', 'Ten Thousand Steps to the Summit.epub',
    'Starlight Courier.epub', 'The Quiet Alchemist.epub', 'River of Small Lights.epub', 'Crane and the Clockmaker.epub',
    'Echoes of the Ninth Gate/', 'Historical/', 'JavaScript Fundamentals/',
  ],
  [`${SD}/Novels/Chinese Novels/JavaScript Fundamentals`]: ['Chapter 01 - Introduction.pdf', 'Chapter 02 - Variables and Types.pdf', 'Chapter 03 - Functions.pdf', 'Chapter 04 - Arrays and Loops.pdf', 'Chapter 05 - Objects.pdf'],
  [`${SD}/Novels/Chinese Novels/Historical`]: ['Lotus Court/', 'The Last Imperial Tailor.epub'],
  [`${SD}/Novels/Chinese Novels/Historical/Lotus Court`]: ['Lotus Court 1-50.epub', 'Lotus Court 51-100.epub', 'Lotus Court 101-152 (End).epub'],
  [`${SD}/Novels/Chinese Novels/Echoes of the Ninth Gate`]: ['Echoes of the Ninth Gate Vol 1 (Ch 1-40).epub', 'Echoes of the Ninth Gate Vol 2 - Ninefold Debts.epub', 'Echoes of the Ninth Gate Vol 3 - Lanterns at Dusk.epub', 'Echoes of the Ninth Gate Vol 4 (Ch 121-160).epub', 'Echoes of the Ninth Gate Vol 5 (Ch 161-200).epub', 'Echoes of the Ninth Gate Vol 6 (Ch 201-240).epub', 'Echoes of the Ninth Gate Vol 7 (Ch 241-280).epub', 'Echoes of the Ninth Gate Vol 8 (Ch 281-320).epub', 'Echoes of the Ninth Gate Vol 9 (Ch 321-360).epub', 'Echoes of the Ninth Gate Vol 10 (Ch 361-400).epub', 'Echoes of the Ninth Gate Vol 11 (Ch 401-440).epub', 'Echoes of the Ninth Gate Vol 12 (Ch 441-480).epub'],
};
const files = {};
// ?goal=1: the extras turned on in Settings
if (new URLSearchParams(location.search).get('cat')) window.__settings = JSON.stringify({look: 'drawn', cats: true});
if (new URLSearchParams(location.search).get('drawn')) window.__settings = JSON.stringify({look: 'drawn'});
if (new URLSearchParams(location.search).get('goal')) window.__settings = JSON.stringify({profile: {goal: true, chart: true, streak: true, genres: true, time: true}, goal: 12, length: true, warnings: true, ...(new URLSearchParams(location.search).get('cat') ? {look: 'drawn', cats: true} : {})});
window.__files = files;
const done = (y, m, d) => ({state: 'completed', at: Date.UTC(y, m, d), history: [{state: 'reading', at: Date.UTC(y, m, d - 9)}, {state: 'completed', at: Date.UTC(y, m, d)}]});
const meta = {
  version: 1,
  books: {
    'Chinese Novels/Moon Over the Jade Pavilion.epub': {notes: [
      {id: 'a', title: 'Why I love it', text: 'The slow build is perfect. Wen Shu never once explains herself and somehow that makes every scene with the prince hit harder. Re-read chapter 34 (the rain scene).', color: 'lemon', at: Date.UTC(2026, 10, 2), rating: 5},
      {id: 'b', title: 'Favourite line', text: '"Some letters are written so they will never be read." Ch 12.', color: 'rose', at: Date.UTC(2026, 10, 5), rating: 4},
      {id: 'c', text: 'Stopped at ch 78. The Empress Dowager arc starts here.', color: 'sky', at: Date.UTC(2026, 10, 9)},
    ], genres: ['Drama', 'Romance', 'Historical', 'Slice of Life'], tags: ['Archivists', 'Beautiful Female Lead', 'Calm Protagonist', 'Court Politics', 'Hidden Identity', 'Imperial Harem', 'Letters', 'Palace Intrigue', 'Slow Romance', 'Rainy Days', 'Mature Protagonist', 'Royalty', 'Secret Relationship', 'Second Chance', 'Tragic Past', 'Wise Protagonist', 'Clever Protagonist', 'Doting Love Interests', 'Heartwarming', 'Loneliness', 'Older Love Interests', 'Poetry', 'Gardens', 'Strategists', 'Tea Ceremony'], language: 'Chinese', status: '112 Chapters + 4 Extras (Completed)', translated: 'Yes',
      description: 'For three seasons the archivist Wen Shu had catalogued the Jade Pavilion without once being noticed, which suited her perfectly.\nThen she opened a letter that had been sealed for twenty years, and the quiet prince who lived in the east wing began appearing at her desk every evening with tea she had not asked for.\nHe said he only wanted the letter back.\nHe did not explain why he kept staying after she returned it, or why the palace guards had started to call her "the prince\'s scholar".\nWhen the old Empress Dowager summoned her to the inner court, Wen Shu realised the letter had never been about love at all, but about a debt the whole dynasty would rather forget.\nThe prince, who had always been calm, lost his composure only once: the night she did not come back from the inner court. He walked through the rain to every gate of the palace until he found her, and said nothing at all on the way home.\nLater the court would whisper about it for years.'},
    'Chinese Novels/The Tea House on Willow Street.epub': {fav: true, reading: done(2026, 9, 14), notes: [{id: 't1', title: 'Comfort read', text: 'The general arguing with the baker about dumpling folds. Every single chapter.', color: 'mint', at: Date.UTC(2026, 9, 14), rating: 4}], genres: ['Slice of Life', 'Comedy'], tags: ['Retirement', 'Food'], language: 'Chinese', status: '60 Chapters (Completed)', translated: 'Yes', description: 'A retired general opens a tiny tea house and tries very hard to live a quiet life. The neighbours have other plans.'},
    'Paper books/The Little Prince.paper': {paper: true, author: 'Antoine de Saint-Exupéry', genres: ['Fable'], language: 'French', source: 'Secondhand shop in Fremantle', loan: {dir: 'lent', who: 'Mina', at: Date.UTC(2026, 9, 28)}, reading: done(2026, 8, 21), description: 'A pilot stranded in the desert meets a small prince from another planet.'},
    'Chinese Novels/A Sword Without a Name.epub': {reading: done(2026, 7, 3), warnings: ['Graphic violence', 'Major character death'], genres: ['Action', 'Fantasy', 'Martial Arts'], tags: ['Sects', 'Weapon Spirits'], language: 'Chinese', description: 'An apprentice inherits a blade that refuses to be named, and every sect in the land wants to know why.'},
    'Chinese Novels/Echoes of the Ninth Gate/Echoes of the Ninth Gate#vols': {reading: {state: 'reading', at: Date.UTC(2026, 10, 1), history: [{state: 'reading', at: Date.UTC(2026, 10, 1)}]}, title: 'Echoes of the Ninth Gate', genres: ['Fantasy', 'Mystery', 'Romance'], tags: ['Exorcists', 'Contracts', 'Rivals to Lovers'], language: 'Chinese', status: '480 Chapters (Completed)', translated: 'No', description: 'Two rival exorcists are bound by a contract neither remembers signing. Nine gates, nine debts, one very long road.'},
    'Korean Novels/Rain Over Busan.epub': {fav: true, reading: done(2026, 10, 6), notes: [{id: 'r1', title: 'Favourite line', text: '"Forecasts are just hopes with numbers attached." Ch 9.', color: 'sky', at: Date.UTC(2026, 10, 6), rating: 5}, {id: 'r2', text: 'Ending felt rushed but the last photo scene made up for it.', color: 'paper', at: Date.UTC(2026, 10, 7)}], genres: ['Romance', 'Drama'], tags: ['Photography', 'Weather'], language: 'Korean', status: '45 Chapters (Completed)', translated: 'Yes', description: 'A weather forecaster who is always wrong meets a photographer who only shoots storms.'},
    'Korean Novels/Winter Ferry.epub': {reading: done(2026, 1, 20), genres: ['Romance', 'Slice of Life'], tags: ['Islands', 'Letters'], language: 'Korean', status: '30 Chapters (Completed)', description: 'A ferry captain carries the same passenger every winter. This year she does not get off.'},
    'Korean Novels/The Lighthouse Keeper.epub': {genres: ['Drama', 'Mystery'], tags: ['Lighthouses', 'Small Town'], language: 'Korean', description: 'Moved here after a rename: the details come back on their own.'},
    'Chinese Novels/Historical/Lotus Court/Lotus Court 1-50.epub': {genres: ['Historical', 'Romance'], tags: ['Court Politics', 'Embroidery'], language: 'Chinese', status: '152 Chapters (Completed)', description: 'Three files in one folder, shown as one book with three parts.'},
    'Chinese Novels/Starlight Courier.epub': {reading: done(2026, 4, 11), genres: ['Sci-fi', 'Comedy'], tags: ['Space', 'Delivery'], description: 'The galaxy\'s most punctual delivery driver is assigned a parcel that keeps trying to escape.'},
  },
};
const CAL_OPF = `<package><metadata><dc:title>Leviathan Wakes</dc:title><dc:creator opf:role="aut">James S. A. Corey</dc:creator><dc:description>&lt;p&gt;Humanity has colonized the solar system. A derelict ship, a missing girl, and a conspiracy that threatens everyone.&lt;/p&gt;</dc:description><dc:language>eng</dc:language><dc:subject>Space Opera</dc:subject><dc:subject>Mystery</dc:subject><meta name="calibre:series" content="The Expanse"/><meta name="calibre:series_index" content="1.0"/><meta name="calibre:rating" content="8.0"/></metadata></package>`;
const GR_CSV = 'Book Id,Title,Author,My Rating,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review\r\n1,"Starlight Courier",Ada Lin,4,2026/05/11,2026/04/01,,read,"Silly and warm."\r\n2,"The Fox Who Kept the Library",,5,2026/09/02,2026/08/20,favorites,read,"The ending!"\r\n3,"Ferryman of the North Sea",,0,,2026/10/01,,to-read,\r\n4,"Glass Orchard",Ren Hao,0,,2026/10/03,,to-read,\r\n';
const COLORS = ['#c9d6df', '#f2d7b6', '#d8c7e8', '#cfe3c5', '#f0c9c9', '#c7dbe8', '#e8e2c7'];
function svgCover(title) {
  let h = 0; for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const c = COLORS[Math.abs(h) % COLORS.length];
  const words = title.replace(/\.epub$/, '').split(' ');
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 12) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  lines.push(cur.trim());
  const text = lines.slice(0, 5).map((l, i) => `<text x="200" y="${230 + i * 46}" font-size="38" text-anchor="middle" font-family="Georgia" fill="#222">${l}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="${c}"/><circle cx="200" cy="120" r="50" fill="none" stroke="#222" stroke-width="4"/><rect x="30" y="30" width="340" height="540" fill="none" stroke="#222" stroke-width="3"/>${text}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

window.__opened = [];
NativeModules.InkShelf = {
  listDir: async path => (tree[path] || []).map((n, i) => ({name: n.replace(/\/$/, ''), path: `${path}/${n.replace(/\/$/, '')}`, isDir: n.endsWith('/'), size: 1000, mtime: Date.UTC(2026, 10, 11) - ((n.length * 7 + i * 3) % 40) * 86400000})).concat(Object.keys(files).filter(f => f.slice(0, f.lastIndexOf('/')) === path && !(tree[path] || []).includes(f.slice(f.lastIndexOf('/') + 1))).map(f => ({name: f.slice(f.lastIndexOf('/') + 1), path: f, isDir: false, size: 1, mtime: (window.__mt || {})[f] || 1}))),
  readText: async path => (path.endsWith('metadata.opf') ? CAL_OPF : path.endsWith('settings.json') && window.__settings && !files[path] ? window.__settings : path.endsWith('.csv') ? GR_CSV : path.endsWith('state.json') ? window.__state || null : path.endsWith('/.inkshelf/library.json') ? files[path] || JSON.stringify(path.includes('/Novels/') ? novelsMeta() : {version: 1, books: {}}) : path.endsWith('libraries.json') ? (window.__libs || null) : files[path] || null),
  writeZip: async (path, entries) => { files[path] = entries; (window.__mt = window.__mt || {})[path] = Date.now(); window.__zip = entries; return true; },
  readZip: async path => files[path] || null,
  appendText: async (p, t) => { console.log('LOG', t.trim()); return true; },
  writeText: async (path, text) => { if (new URLSearchParams(location.search).get('ro') && path.startsWith(SD)) return false; files[path] = text; if (path.endsWith('state.json')) window.__state = text; if (path.endsWith('libraries.json')) window.__libs = text; return true; },
  extractEpubCover: async epub => (/Paper Lanterns|Crane/.test(epub) ? null : svgCover(epub.split('/').pop())),
  // the same card reported under several paths (what showed up as "10 SD cards")
  storageRoots: async () => (new URLSearchParams(location.search).get('nosd') ? {roots: [], how: 'none'} : {roots: [
    {path: '/mnt/media_rw/ABCD-1234', label: 'SD card', readable: false}, {path: SD, label: 'SD card', readable: true}, {path: '/storage/abcd-1234', label: 'SD card', readable: true},
  ], how: 'volume:' + SD}),
  copyText: async t => ((window.__copied = t), true),
  prepareImage: async (src, out) => (out.includes('/covers/own-') ? svgCover('Lotus Court Screenshot Cover') : out),
  // what is written inside each EPUB (OPF): a few have an author and a blurb
  readEpubMeta: async p => {
    const name = p.split('/').pop();
    const by = {'A Sword Without a Name.epub': 'Gu Feng', 'Starlight Courier.epub': 'Ada Lin', 'Salt and Honey.epub': 'Han Yuri', 'Paper Lanterns in Winter.epub': 'Mo Qing'};
    const blurb = {'Paper Lanterns in Winter.epub': 'Every winter a lantern-maker hangs one lantern for each person the town has forgotten. This year there is one for her.', 'Salt and Honey.epub': 'A beekeeper and a salt farmer share one stretch of coast and refuse to share anything else.'};
    return `<package><metadata><dc:title>${name}</dc:title>${by[name] ? `<dc:creator>${by[name]}</dc:creator>` : '<dc:creator>Unknown</dc:creator>'}${blurb[name] ? `<dc:description>&lt;p&gt;${blurb[name]}&lt;/p&gt;</dc:description>` : ''}<dc:language>${p.includes('Korean') ? 'ko' : 'zh'}</dc:language></metadata></package>`;
  },
  epubWords: async p => ({words: /Korean|Calibre/.test(p) ? 82000 + (p.length % 7) * 9000 : 0, cjk: /Chinese/.test(p) ? 180000 + (p.length % 5) * 40000 : 0}),
  removePaper: async p => true,
  openFileManager: async () => ((window.__fm = 1), true),
  openDocument: async (path, how) => { window.__opened.push(how + ':' + path); return true; },
};
if (new URLSearchParams(location.search).get('lib')) {
  window.__libs = JSON.stringify([{name: 'Novels', path: `${SD}/Novels`}, {name: 'Books', path: `${SD}/Books`}].slice(0, Number(new URLSearchParams(location.search).get('lib'))));
}

export const PluginManager = {
  init() {}, registerButton() {}, closePluginView: async () => { window.__closed = 1; return true; },
  hasPermission: async p => (window.__perm?.[p] ?? (new URLSearchParams(location.search).get('perm') ? 0 : 1)), requestPermission: async p => { const pick = Number(new URLSearchParams(location.search).get('pick') || 2); window.__perm = {...(window.__perm || {}), [p]: pick ? 1 : 0}; return pick; }, // like Supernote: hasPermission says 0/1; the question returns 0 no, 1 this time, 2 always getPluginDirPath: async () => '/plugin', registerConfigButton: async () => true, registerConfigButtonListener: () => ({remove() {}}), showPluginView: async () => true,
};
export const FileUtils = {exists: async () => true, getExternalDirPath: async () => ['/storage/emulated/0', SD]};
// ?state=1: the reader added two books since InkShelf last looked (they show as NEW)
function novelsMeta() {
  if (!new URLSearchParams(location.search).get('state')) return meta;
  const root = `${SD}/Novels`;
  const all = [];
  const walk = d => (tree[d] || []).forEach(n => (n.endsWith('/') ? walk(`${d}/${n.slice(0, -1)}`) : all.push(`${d}/${n}`.slice(root.length + 1))));
  walk(root);
  return {...meta, seenFiles: all.filter(f => !/Starlight Courier|Vol 12/.test(f))};
}
// ?backup=1: a fresh install, with a backup left by 1.0 in the old folder (Document/InkShelf): PurrinkShelf still finds it
if (new URLSearchParams(location.search).get('backup')) {
  const N = `${SD}/Novels`;
  files['/storage/emulated/0/Document/InkShelf/InkShelf backup.json'] = JSON.stringify({
    app: 'InkShelf', version: 1, savedAt: Date.UTC(2026, 10, 9),
    libraries: [{name: 'Novels', path: N}],
    settings: {paging: 'arrows', libraryGrid: true, showFilters: true},
    state: {recent: [], bookmarks: [], searches: ['jade'], lastLib: N},
    metas: {[N]: {...meta, seenFiles: undefined}},
  });
  files[`${N}/.inkshelf/library.json`] = JSON.stringify({version: 1, books: {}});
}
window.__pasted = [];
export const PluginCommAPI = {
  getCurrentFilePath: async () => ({success: true, result: new URLSearchParams(location.search).get('reading') ? `${SD}/Novels/Korean Novels/Rain Over Busan.epub` : '/storage/emulated/0/Note/Book reviews.note'}),
  getPageDisplaySize: async () => ({success: true, result: {width: 1404, height: 1872}}),
};
export const PluginNoteAPI = {
  insertImage: async p => (window.__pasted.push('image:' + p), {success: true, result: true}),
  insertText: async t => (window.__pasted.push('text:' + t.textContentFull.split('\n')[0]), {success: true, result: true}),
};
export const PluginFileAPI = {openFile: async () => ({success: true, result: true})};
export const RattaFileSelector = {
  selectImage: async () => null,
  // Supernote's own file picker: pretend the reader picked a book inside Novels/Chinese Novels
  selectFile: async o => ((window.__picker = o), o?.suffixList?.includes('csv') ? ['/storage/emulated/0/Document/goodreads_library_export.csv'] : o?.suffixList?.includes('png') ? [`${o.needSelectFolder}/20261110_201533.png`] : [`${SD}/Novels/Chinese Novels/Moon Over the Jade Pavilion.epub`]),
};

// ?state=1 : pretend some books were read, bookmarked and searched for
if (new URLSearchParams(location.search).get('state')) {
  const N = `${SD}/Novels`;
  const snap = (key, title, folder, genres, file, vol) => ({lib: N, libName: 'Novels', key, title, folder, genres, cover: file ? svgCover(file) : null, vol, at: Date.now()});
  const echoes = snap('Chinese Novels/Echoes of the Ninth Gate/Echoes of the Ninth Gate#vols', 'Echoes of the Ninth Gate', 'Chinese Novels', ['Fantasy', 'Mystery', 'Romance'], 'Echoes of the Ninth Gate Vol 1 (Ch 1-40).epub', 4);
  const moon = snap('Chinese Novels/Moon Over the Jade Pavilion.epub', 'Moon Over the Jade Pavilion', 'Chinese Novels', ['Drama', 'Romance', 'Historical', 'Slice of Life'], 'Moon Over the Jade Pavilion.epub');
  const rain = snap('Korean Novels/Rain Over Busan.epub', 'Rain Over Busan', 'Korean Novels', ['Romance', 'Drama'], 'Rain Over Busan.epub');
  const fox = snap('Chinese Novels/The Fox Who Kept the Library.epub', 'The Fox Who Kept the Library', 'Chinese Novels', [], 'The Fox Who Kept the Library.epub');
  const crane = snap('Chinese Novels/Crane and the Clockmaker.epub', 'Crane and the Clockmaker', 'Chinese Novels', [], null);
  const tea = snap('Chinese Novels/The Tea House on Willow Street.epub', 'The Tea House on Willow Street', 'Chinese Novels', ['Slice of Life', 'Comedy'], 'The Tea House on Willow Street.epub');
  const sword = snap('Chinese Novels/A Sword Without a Name.epub', 'A Sword Without a Name', 'Chinese Novels', ['Action', 'Fantasy', 'Martial Arts'], 'A Sword Without a Name.epub');
  window.__state = JSON.stringify({
    recent: [echoes, moon, rain, fox, crane, tea, sword],
    bookmarks: [moon, echoes, rain],
    searches: ['jade', 'fox', 'ninth gate', 'busan'],
    lastLib: N,
    days: (() => { const out = []; const d = new Date(); for (let i = 0; i < 40; i++) { if (![5, 6, 12, 19, 20, 21, 30].includes(i)) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); d.setDate(d.getDate() - 1); } return out.reverse(); })(),
    wishlist: [
      {id: 'w1', title: 'The Moonlit Archive', author: 'Shen Yu', where: 'Recommended in the book club', note: 'Sequel to the archivist story everyone talks about', added: Date.UTC(2026, 10, 3)},
      {id: 'w2', title: 'Ferryman of the North Sea', where: 'Novel site, vol 1 is free', added: Date.UTC(2026, 9, 20)},
      {id: 'w3', title: 'Salt and Honey', author: 'Han Yuri', note: 'Mina said the ending made her cry', added: Date.UTC(2026, 9, 2)},
    ],
  });
}
