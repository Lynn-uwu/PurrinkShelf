// Libraries, scanning and saved details (titles, tags, descriptions, covers).
import {PluginManager} from 'sn-plugin-lib';
import {extractEpubCover, listDir, readText, writeText} from './native';

export type Lib = {name: string; path: string; exclude?: string[]}; // exclude: folders/files inside it to leave out
export type Vol = {n: number; label: string; path: string; kind?: string}; // kind: Vol, Part, Ch… as written in the file name
export type Book = {
  key: string; // stable id inside the library (relative path or series id)
  fileTitle: string; // from the file / series name
  folder: string; // top-level folder inside the library ('' = main folder)
  files: string[]; // absolute paths (one, or one per volume)
  vols: Vol[];
  ext: string;
  added: number; // newest file date (ms), for "newly added"
  dir: string; // folder inside the library that holds it ('' = main folder)
  series?: 'auto' | 'folder' | 'group'; // several files shown as one book
  missing?: boolean; // details kept, but the file isn't there any more
};
export type NoteColor = 'lemon' | 'rose' | 'sky' | 'mint' | 'paper';
export type Note = {id: string; title?: string; text: string; color: NoteColor; at: number};
export const MAX_NOTES = 5;
export type Meta = {
  title?: string;
  genres?: string[];
  tags?: string[];
  description?: string;
  cover?: string;
  language?: string;
  status?: string; // e.g. "94 Chapters + 6 Extras (Completed)"
  translated?: 'Yes' | 'No';
  notes?: Note[];
  categories?: string[]; // when set, replaces the categories taken from folder names
  fav?: boolean;
  reading?: Reading; // your reading status, with dates
  seen?: string[]; // files (inside the library) this book was last found as, to reconnect it
};
// ---------- reading status (like review states: each change is dated) ----------
export type ReadState = 'plan' | 'reading' | 'completed' | 'rereading' | 'hold' | 'dropped';
export const READ_STATES: {id: ReadState; label: string}[] = [
  {id: 'plan', label: 'Plan to read'},
  {id: 'reading', label: 'Reading'},
  {id: 'completed', label: 'Completed'},
  {id: 'rereading', label: 'Rereading'},
  {id: 'hold', label: 'On hold'},
  {id: 'dropped', label: 'Dropped'},
];
export type Reading = {state: ReadState; at: number; history: {state: ReadState; at: number}[]};
export const readLabel = (s?: ReadState) => READ_STATES.find(x => x.id === s)?.label || 'No status';
export function setReading(r: Reading | undefined, state: ReadState | null): Reading | undefined {
  if (!state) return undefined;
  const at = Date.now();
  return {state, at, history: [...(r?.history || []), {state, at}].slice(-40)};
}
/** how many times a book was finished */
export const timesRead = (r?: Reading) => (r?.history || []).filter(h => h.state === 'completed').length;

// ---------- collections: hand-picked books, plus books that match rules ----------
export type RuleField = 'genre' | 'tag' | 'category' | 'status' | 'language' | 'fav' | 'library' | 'title';
export type Rule = {field: RuleField; op: 'has' | 'not'; value: string};
export type Collection = {
  id: string;
  name: string;
  rules: Rule[];
  match: 'all' | 'any';
  add: string[]; // "lib|key" added by hand
  remove: string[]; // "lib|key" taken out by hand (even if the rules match)
  cover?: string; // its own picture (otherwise the first book covers)
};
export const RULE_FIELDS: {id: RuleField; label: string}[] = [
  {id: 'status', label: 'Reading status'},
  {id: 'fav', label: 'Favourite'},
  {id: 'genre', label: 'Genre'},
  {id: 'tag', label: 'Tag'},
  {id: 'category', label: 'Category'},
  {id: 'language', label: 'Language'},
  {id: 'library', label: 'Library'},
  {id: 'title', label: 'Title has'},
];
/** the collections everyone starts with (they can be changed or removed) */
export const STARTER_COLLECTIONS: Collection[] = [
  {id: 'fav', name: 'Favourites', rules: [{field: 'fav', op: 'has', value: 'Yes'}], match: 'all', add: [], remove: []},
  {id: 'reading', name: 'In progress', rules: [{field: 'status', op: 'has', value: 'Reading'}, {field: 'status', op: 'has', value: 'Rereading'}], match: 'any', add: [], remove: []},
  {id: 'completed', name: 'Completed', rules: [{field: 'status', op: 'has', value: 'Completed'}], match: 'all', add: [], remove: []},
];
export const COLLECTION_TEMPLATES: Collection[] = [
  ...STARTER_COLLECTIONS,
  {id: 'plan', name: 'Plan to read', rules: [{field: 'status', op: 'has', value: 'Plan to read'}], match: 'all', add: [], remove: []},
  {id: 'reread', name: 'Rereading', rules: [{field: 'status', op: 'has', value: 'Rereading'}], match: 'all', add: [], remove: []},
  {id: 'hold', name: 'On hold', rules: [{field: 'status', op: 'has', value: 'On hold'}], match: 'all', add: [], remove: []},
];
export type BookFacts = {lib: Lib; book: Book; meta: Meta};
function valuesOf(f: RuleField, x: BookFacts): string[] {
  const m = x.meta;
  if (f === 'genre') return m.genres || [];
  if (f === 'tag') return m.tags || [];
  if (f === 'category') return catsOf(x.book, m);
  if (f === 'status') return [readLabel(m.reading?.state)];
  if (f === 'language') return m.language ? [m.language] : [];
  if (f === 'fav') return [m.fav ? 'Yes' : 'No'];
  if (f === 'library') return [x.lib.name];
  return [m.title || x.book.fileTitle];
}
export function inCollection(c: Collection, x: BookFacts): boolean {
  const id = `${x.lib.path}|${x.book.key}`;
  if (c.remove.includes(id)) return false;
  if (c.add.includes(id)) return true;
  if (!c.rules.length) return false;
  const test = (r: Rule) => {
    const vals = valuesOf(r.field, x).map(v => v.toLowerCase());
    const v = r.value.toLowerCase();
    const hit = r.field === 'title' ? vals.some(t => t.includes(v)) : vals.includes(v);
    return r.op === 'has' ? hit : !hit;
  };
  // "not" rules always have to hold; "has" rules follow match all / any
  const nots = c.rules.filter(r => r.op === 'not');
  const has = c.rules.filter(r => r.op === 'has');
  if (!nots.every(test)) return false;
  if (!has.length) return true;
  return c.match === 'all' ? has.every(test) : has.some(test);
}

/** anything worth keeping when the file disappears */
export const hasDetails = (m?: Meta) =>
  !!m && !!(m.title || m.genres?.length || m.tags?.length || m.description || m.cover || m.language || m.status || m.translated || m.notes?.length || m.categories?.length || m.fav || m.reading);
/** still waiting for a genre/tag or a summary */
export const needsDetails = (m: Meta) => !(m.genres?.length || m.tags?.length) || !m.description;
export type Settings = {
  paging: 'arrows' | 'scroll'; // long book pages: turn with arrows, or scroll
  libraryGrid: boolean;
  volumeGrid: boolean;
  showFilters: boolean;
  views: {[page: string]: 'list' | 'grid'}; // list or grid on Bookmarks, New, Search and View all
  missing: 'flag' | 'delete'; // when a book's file disappears: keep its details and flag it, or forget it
  sort: {by: SortBy; asc: boolean};
  libFolders: boolean; // library shown as folders instead of books
  badges: {newBadge: boolean; notes: boolean; vols: boolean};
  backupDir: string; // where the backup file is kept (survives reinstalling InkShelf)
};
export const DEFAULT_BACKUP_DIR = '/storage/emulated/0/Document/InkShelf';
export const BACKUP_NAME = 'InkShelf backup.json';
export type SortBy = 'title' | 'read' | 'added' | 'vols' | 'category';
export const DEFAULT_SETTINGS: Settings = {
  paging: 'arrows', libraryGrid: false, volumeGrid: false, showFilters: true, views: {gallery: 'grid'},
  missing: 'flag', sort: {by: 'title', asc: true}, libFolders: false, badges: {newBadge: true, notes: true, vols: true},
  backupDir: DEFAULT_BACKUP_DIR,
};

/** a book remembered outside its library (recently read, bookmarks) */
export type Snap = {lib: string; libName: string; key: string; title: string; cover?: string | null; folder?: string; genres?: string[]; vol?: number; at: number};
export type AppState = {recent: Snap[]; bookmarks: Snap[]; searches: string[]; lastLib?: string; knownRoots?: string[]; collections?: Collection[]; sheetAt?: number};
export const EMPTY_STATE: AppState = {recent: [], bookmarks: [], searches: []};
export type MetaStore = {
  version: 1;
  books: {[key: string]: Meta};
  seenFiles?: string[]; // every book file found at the last scan (paths inside the library)
  newKeys?: string[]; // books found since the library was added that you haven't opened yet
  lastScan?: number;
  series?: {[dir: string]: boolean}; // folder -> one book (true) or never combine (false)
  groups?: {[id: string]: {title: string; files: string[]}}; // books combined by hand
  missing?: {[key: string]: number}; // books whose file disappeared (since when)
  savedAt?: number;
};

// ---------- names ----------
export const norm = (t: string) => t.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9À-￿]+/g, '');
/** how alike two names are, 0..1 (shared letter pairs) */
export function similar(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const pairs = (t: string) => { const m = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) || 0) + 1); return m; };
  const px = pairs(x), py = pairs(y);
  let both = 0;
  px.forEach((n, k) => (both += Math.min(n, py.get(k) || 0)));
  return (2 * both) / Math.max(1, x.length - 1 + y.length - 1);
}
const base = (p: string) => p.split('/').pop() || p;
/** the file a saved key points at, for keys saved before "seen" existed */
function keyFiles(key: string): string[] {
  if (key.startsWith('group:') || key.endsWith('#series')) return [];
  return [key.replace(/#vols$/, '').replace(/^\//, '')];
}
export const keyName = (key: string) => base(key.replace(/^group:/, '').replace(/#(vols|series)$/, '')).replace(/\.[^.]+$/, '');
export const keyDir = (key: string) => { const k = key.replace(/^\//, '').replace(/#(vols|series)$/, ''); return key.endsWith('#series') ? k : k.split('/').slice(0, -1).join('/'); };

/** categories from folder names: Category / Sub-category / (series folder) */
export function folderCats(b: Book): string[] {
  const segs = b.dir.split('/').filter(Boolean);
  if (!segs.length) return [];
  const last = segs[segs.length - 1];
  if (b.series === 'auto' || b.series === 'folder' || similar(last, b.fileTitle) > 0.6 || norm(b.fileTitle).includes(norm(last))) segs.pop();
  return segs;
}
export const catsOf = (b: Book, m?: Meta) => (m?.categories ? m.categories : folderCats(b));

/**
 * Compare a fresh scan with what InkShelf saw last time (like a game list refresh).
 * The very first scan of a library marks nothing as new.
 * Books whose files are gone keep their details: they reconnect when a file with the
 * same name (or a very similar name in the same folder) turns up again.
 */
export function reconcile(root: string, books: Book[], meta: MetaStore, policy: 'flag' | 'delete' = 'flag') {
  const rel = (p: string) => (p.startsWith(root + '/') ? p.slice(root.length + 1) : p);
  const now = books.flatMap(b => b.files.map(rel));
  const first = !meta.seenFiles;
  const seen = new Set(meta.seenFiles || []);
  const nowSet = new Set(now);
  let added = first ? [] : books.filter(b => b.files.some(f => !seen.has(rel(f)))).map(b => b.key);
  const removed = first ? 0 : (meta.seenFiles || []).filter(f => !nowSet.has(f)).length;
  const keys = new Set(books.map(b => b.key));
  const out: {[k: string]: Meta} = {...meta.books};
  const missing: {[k: string]: number} = {...(meta.missing || {})};
  const relinked: [string, string][] = [];

  // reconnect details whose book moved or was renamed
  const free = () => books.filter(b => !hasDetails(out[b.key]));
  const gone = Object.keys(out).filter(k => !keys.has(k) && hasDetails(out[k]));
  for (const k of gone) {
    const m = out[k];
    const files = m.seen?.length ? m.seen : keyFiles(k);
    const names = files.map(base);
    const name = keyName(k);
    const dir = keyDir(k);
    const cand = free();
    const hit =
      cand.find(b => files.length > 0 && b.files.map(rel).some(f => files.includes(f))) || // its file is now part of another book (e.g. a series)
      cand.find(b => b.files.some(f => names.includes(base(f)))) || // same file name, anywhere
      cand.find(b => norm(b.fileTitle) === norm(name)) || // same title, anywhere
      cand.find(b => b.dir === dir && similar(b.fileTitle, name) >= 0.75) || // similar name, same folder
      cand.find(b => similar(b.fileTitle, name) >= 0.9);
    if (hit) {
      out[hit.key] = {...m, seen: hit.files.map(rel)};
      delete out[k];
      delete missing[k];
      relinked.push([k, hit.key]);
      added = added.filter(x => x !== hit.key);
    } else if (!missing[k]) missing[k] = Date.now();
  }
  // a card that isn't there shouldn't wipe everything: only forget when most books are still here
  const safe = books.length > 0 && Object.keys(missing).length <= Math.max(3, books.length / 2);
  for (const k of Object.keys(missing)) {
    if (keys.has(k) || !out[k]) delete missing[k];
    else if (policy === 'delete' && safe) { delete out[k]; delete missing[k]; }
  }
  // remember where each book with details lives now
  for (const b of books) {
    const m = out[b.key];
    if (!hasDetails(m)) continue;
    const r = b.files.map(rel);
    if (JSON.stringify(m!.seen || []) !== JSON.stringify(r)) out[b.key] = {...m, seen: r};
  }
  const newKeys = Array.from(new Set([...(meta.newKeys || []).filter(k => keys.has(k)), ...added]));
  const changed = first || added.length > 0 || removed > 0 || relinked.length > 0 || newKeys.length !== (meta.newKeys || []).length ||
    JSON.stringify(out) !== JSON.stringify(meta.books) || JSON.stringify(missing) !== JSON.stringify(meta.missing || {});
  return {
    meta: {...meta, books: out, missing, seenFiles: now, newKeys, lastScan: Date.now()} as MetaStore,
    added, removed, changed, relinked, missingCount: Object.keys(missing).length,
  };
}

/** books whose files are gone but whose details are kept */
export function missingBooks(meta: MetaStore): Book[] {
  return Object.keys(meta.missing || {})
    .filter(k => meta.books[k])
    .map(k => ({key: k, fileTitle: keyName(k), folder: keyDir(k).split('/')[0] || '', dir: keyDir(k), files: [], vols: [], ext: '', added: meta.missing![k], missing: true}));
}

const BOOK_EXT = ['epub', 'pdf', 'cbz', 'fb2', 'xps', 'mobi', 'txt', 'docx'];
const DATA_DIR = '.inkshelf';

// ---------- the list of libraries (kept with the plugin) ----------
async function pluginDir(): Promise<string> {
  try {
    const d = await PluginManager.getPluginDirPath();
    if (d) return String(d).replace(/\/+$/, '');
  } catch (e) {}
  return '/storage/emulated/0/MyStyle';
}

export async function loadLibraries(): Promise<Lib[]> {
  const t = await readText(`${await pluginDir()}/libraries.json`);
  try {
    return t ? JSON.parse(t) : [];
  } catch (e) {
    return [];
  }
}

/** false on a fresh install (nothing saved with the plugin yet) */
export async function isSetUp(): Promise<boolean> {
  return (await readText(`${await pluginDir()}/libraries.json`)) !== null;
}

// ---------- backup: everything InkShelf wrote, in one file the reader can keep ----------
export type Backup = {app: 'InkShelf'; version: 1; savedAt: number; libraries: Lib[]; settings: Settings; state: AppState; metas: {[path: string]: MetaStore}};
export async function writeBackup(dir: string, b: Omit<Backup, 'app' | 'version' | 'savedAt'>): Promise<boolean> {
  return writeText(`${dir}/${BACKUP_NAME}`, JSON.stringify({app: 'InkShelf', version: 1, savedAt: Date.now(), ...b}, null, 1));
}
export async function readBackup(dir: string): Promise<Backup | null> {
  const t = await readText(`${dir}/${BACKUP_NAME}`);
  try {
    const b = t ? JSON.parse(t) : null;
    if (b && b.app === 'InkShelf' && Array.isArray(b.libraries)) return b;
  } catch (e) {}
  return null;
}
/** put a backed-up library's details back, keeping anything newer that is already there */
export async function restoreMeta(root: string, saved: MetaStore): Promise<void> {
  const t = await readText(`${root}/${DATA_DIR}/library.json`);
  let cur: MetaStore | null = null;
  try { cur = t ? JSON.parse(t) : null; } catch (e) {}
  const merged: MetaStore = cur?.books
    ? {...saved, ...cur, books: {...saved.books, ...cur.books}, groups: {...(saved.groups || {}), ...(cur.groups || {})}, series: {...(saved.series || {}), ...(cur.series || {})}}
    : saved;
  await saveMeta(root, merged);
}

export async function saveLibraries(libs: Lib[]) {
  await writeText(`${await pluginDir()}/libraries.json`, JSON.stringify(libs, null, 1));
}

export async function loadSettings(): Promise<Settings> {
  const t = await readText(`${await pluginDir()}/settings.json`);
  try {
    const v = t ? JSON.parse(t) : {};
    return {...DEFAULT_SETTINGS, ...v, views: {...DEFAULT_SETTINGS.views, ...(v.views || {})}};
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings) {
  await writeText(`${await pluginDir()}/settings.json`, JSON.stringify(s, null, 1));
}

export async function loadState(): Promise<AppState> {
  const t = await readText(`${await pluginDir()}/state.json`);
  try {
    return {...EMPTY_STATE, ...(t ? JSON.parse(t) : {})};
  } catch (e) {
    return EMPTY_STATE;
  }
}

export async function saveState(s: AppState) {
  await writeText(`${await pluginDir()}/state.json`, JSON.stringify(s));
}

// ---------- scanning a library folder ----------
const natural = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');
const extOf = (n: string) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

// "Title Vol 2 (Ch 35-66)", "Title - Volume 02", "Title Part 3", "Title Book 1"
const VOL_RE = /^(.*?)(?:^|[\s._-]+)(vol(?:ume)?|part|pt|book|tome|chapter|chap|ch|episode|ep|lesson|module|unit|arc|season)\.?[\s._-]*0*(\d+)(?!\d)(.*)$/i;
/** how a part is shown: "Vol 2", "Part 2", "Ch 2"… */
export const kindName = (w: string) => {
  const k = w.toLowerCase();
  if (k.startsWith('vol') || k === 'tome') return 'Vol';
  if (k === 'part' || k === 'pt') return 'Part';
  if (k.startsWith('ch')) return 'Ch';
  if (k.startsWith('ep')) return 'Ep';
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
};

/** never shown as books: InkShelf's own files (its log, its backup folder) */
export const isOwnFile = (path: string) => /(^|\/)inkshelf[- ]?log[^/]*$/i.test(path) || /\/Document\/InkShelf(\/|$)/i.test(path);

export async function scanLibrary(root: string, exclude: string[] = []): Promise<Book[]> {
  const books: Book[] = [];
  const skip = new Set(exclude);
  const walk = async (dir: string, rel: string, depth: number) => {
    const entries = (await listDir(dir)).filter(e => !isOwnFile(e.path) && !skip.has(rel ? `${rel}/${e.name}` : e.name));
    const files = entries.filter(e => !e.isDir && BOOK_EXT.includes(extOf(e.name)));
    const mt = (path: string) => entries.find(e => e.path === path)?.mtime || 0;
    // group volumes of the same title in this folder
    const groups: {[t: string]: Vol[]} = {};
    const singles: typeof files = [];
    const here = rel.split('/').pop() || '';
    for (const f of files) {
      const m = stripExt(f.name).match(VOL_RE);
      // "Chapter 3 - Loops.epub" with no title in front belongs to the folder it is in
      const t = m ? m[1].trim().replace(/[\s._\-–—:]+$/, '') || here : '';
      if (m && t) {
        (groups[t] = groups[t] || []).push({n: parseInt(m[3], 10), kind: kindName(m[2]), label: m[4].trim().replace(/^[-–—:.\s_]+/, '').replace(/[_]+/g, ' '), path: f.path});
      } else {
        singles.push(f);
      }
    }
    const folder = rel.split('/')[0] || '';
    for (const [t, vols] of Object.entries(groups)) {
      if (vols.length === 1) {
        singles.push(files.find(f => f.path === vols[0].path)!);
        continue;
      }
      vols.sort((a, b) => a.n - b.n);
      books.push({
        key: `${rel}/${t}#vols`,
        fileTitle: t,
        folder,
        files: vols.map(v => v.path),
        vols: vols.map(v => ({n: v.n, label: v.label, path: v.path, kind: v.kind})),
        ext: extOf(vols[0].path),
        added: Math.max(...vols.map(v => mt(v.path))),
        dir: rel,
      });
    }
    for (const f of singles) {
      books.push({key: `${rel}/${f.name}`, fileTitle: stripExt(f.name), folder, files: [f.path], vols: [], ext: extOf(f.name), added: f.mtime || 0, dir: rel});
    }
    if (depth < 6) {
      for (const d of entries.filter(e => e.isDir && !e.name.startsWith('_') && !e.name.startsWith('.'))) {
        await walk(d.path, rel ? `${rel}/${d.name}` : d.name, depth + 1);
      }
    }
  };
  await walk(root, '', 0);
  return sortBooks(books);
}
const sortBooks = (books: Book[]) => books.sort((a, b) => natural(a.fileTitle.replace(/^(the|a|an)\s+/i, ''), b.fileTitle.replace(/^(the|a|an)\s+/i, '')));

// ---------- series: several files shown as one book ----------
/** a folder named after its books ("Moon Over Jade/Moon Over Jade 1-50.epub", ...) */
function looksLikeSeries(folderName: string, members: Book[]) {
  const n = norm(folderName);
  if (n.length < 3 || members.length < 2) return false;
  const probe = n.slice(0, Math.min(n.length, 12));
  return members.every(m => norm(m.fileTitle).includes(probe));
}
function combine(key: string, title: string, members: Book[], kind: Book['series'], dir: string): Book {
  const ordered = members.slice().sort((a, b) => natural(a.fileTitle, b.fileTitle));
  const files = ordered.flatMap(m => m.files);
  const stems = files.map(f => stripExt(base(f)));
  const t = norm(title);
  const vols: Vol[] = files.map((p, i) => {
    let label = stems[i];
    // drop the series name from each part's label: "Moon Over Jade 51-100" -> "51-100"
    const k = label.toLowerCase().indexOf(title.toLowerCase());
    if (k >= 0) label = (label.slice(0, k) + label.slice(k + title.length)).replace(/^[\s._\-–—:]+|[\s._\-–—]+$/g, '');
    else if (t && norm(label).startsWith(t)) label = label.replace(/^[^\d(]*/, '');
    return {n: i + 1, label, path: p};
  });
  return {key, fileTitle: title, folder: dir.split('/')[0] || '', files, vols, ext: extOf(files[0] || ''), added: Math.max(0, ...members.map(m => m.added)), dir, series: kind};
}

/**
 * Turn the raw scan into the books you see: folders named after their books become one
 * book, books combined by hand stay combined, and "split" folders are left alone.
 */
export function arrange(root: string, raw: Book[], meta: MetaStore): Book[] {
  const rel = (p: string) => (p.startsWith(root + '/') ? p.slice(root.length + 1) : p);
  const taken = new Set<string>();
  const out: Book[] = [];
  const take = (list: Book[]) => list.forEach(b => taken.add(b.key));
  for (const [id, g] of Object.entries(meta.groups || {})) {
    const fs = new Set(g.files);
    const members = raw.filter(b => !taken.has(b.key) && b.files.some(f => fs.has(rel(f))));
    if (!members.length) continue;
    take(members);
    const dirs = Array.from(new Set(members.map(m => m.dir)));
    out.push(combine(`group:${id}`, g.title, members, 'group', dirs.length === 1 ? dirs[0] : ''));
  }
  const forced = meta.series || {};
  const under = (d: string) => (b: Book) => !taken.has(b.key) && (b.dir === d || b.dir.startsWith(d + '/'));
  for (const d of Object.keys(forced).filter(d => forced[d]).sort((a, b) => a.length - b.length)) {
    const members = raw.filter(under(d));
    if (!members.length) continue;
    take(members);
    out.push(members.length === 1 && !members[0].vols.length ? {...members[0]} : combine(`${d}#series`, d.split('/').pop() || d, members, 'folder', d));
  }
  const dirs = Array.from(new Set(raw.map(b => b.dir))).filter(d => d && forced[d] !== false);
  for (const d of dirs) {
    if (raw.some(b => b.dir !== d && b.dir.startsWith(d + '/'))) continue; // only folders without subfolders of books
    const members = raw.filter(b => !taken.has(b.key) && b.dir === d);
    if (!looksLikeSeries(d.split('/').pop() || '', members)) continue;
    take(members);
    out.push(combine(`${d}#series`, d.split('/').pop() || d, members, 'auto', d));
  }
  out.push(...raw.filter(b => !taken.has(b.key)));
  return sortBooks(out);
}

// ---------- saved details, kept inside the library folder (and a copy with InkShelf) ----------
const copyPath = async (root: string) => `${await pluginDir()}/libraries/${hash(root)}.json`;

/** libraries whose folder plugins can't write to (often an SD card): details live with InkShelf instead */
export const readOnlyLibs = new Set<string>();

export async function loadMeta(root: string): Promise<MetaStore> {
  const t = await readText(`${root}/${DATA_DIR}/library.json`);
  let own: MetaStore | null = null;
  try {
    const m = t ? JSON.parse(t) : null;
    if (m && m.books) own = m;
  } catch (e) {}
  // InkShelf's own copy wins when it is newer (the folder can be read-only, or the card was swapped)
  const c = await loadCache(root);
  if (c?.meta && (!own || (c.meta.savedAt || 0) > (own.savedAt || 0))) return c.meta;
  return own || {version: 1, books: {}};
}

/** Saves to the library folder when allowed, and always to InkShelf's own copy. False only if neither worked. */
export async function saveMeta(root: string, meta: MetaStore, books?: Book[]): Promise<boolean> {
  const m = {...meta, savedAt: Date.now()};
  const inFolder = await writeText(`${root}/${DATA_DIR}/library.json`, JSON.stringify(m, null, 1));
  if (inFolder) readOnlyLibs.delete(root);
  else readOnlyLibs.add(root);
  const old = books ? null : await loadCache(root);
  const inCopy = await writeText(await copyPath(root), JSON.stringify({root, at: Date.now(), meta: m, books: books || old?.books || []}));
  return inFolder || inCopy;
}

/** a file kept with the plugin (covers found in EPUBs, the picture pasted into notes) */
export async function pluginFile(name: string): Promise<string> {
  return `${await pluginDir()}/${name}`;
}

/** what InkShelf saw last time, so a library opens at once and refreshes quietly */
export async function loadCache(root: string): Promise<{meta: MetaStore; books: Book[]} | null> {
  const t = await readText(await copyPath(root));
  try {
    const c = t ? JSON.parse(t) : null;
    if (c && c.meta && c.meta.books) return {meta: c.meta, books: (c.books || []).map((b: Book) => ({...b, dir: b.dir ?? ''}))};
  } catch (e) {}
  return null;
}

// ---------- covers ----------
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Cover for a book: chosen image > cached EPUB cover > freshly extracted > none */
export async function coverFor(root: string, b: Book, meta: Meta | undefined, cache: {[k: string]: string | null}) {
  if (meta?.cover) return meta.cover;
  if (b.key in cache) return cache[b.key];
  let p: string | null = null;
  if (b.ext === 'epub') {
    // kept with InkShelf (the library folder may be read-only)
    p = await extractEpubCover(b.files[0], await pluginFile(`covers/${hash(root)}/${hash(b.key)}.img`));
  }
  cache[b.key] = p;
  return p;
}
