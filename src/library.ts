// Libraries, scanning and saved details (titles, tags, descriptions, covers).
import {PluginManager} from 'sn-plugin-lib';
import {extractEpubCover, listDir, readText, writeText} from './native';

export type Lib = {name: string; path: string};
export type Vol = {n: number; label: string; path: string};
export type Book = {
  key: string; // stable id inside the library (relative path or series id)
  fileTitle: string; // from the file / series name
  folder: string; // top-level folder inside the library ('' = main folder)
  files: string[]; // absolute paths (one, or one per volume)
  vols: Vol[];
  ext: string;
};
export type Meta = {title?: string; tags?: string[]; description?: string; cover?: string};
export type MetaStore = {version: 1; books: {[key: string]: Meta}};

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

export async function saveLibraries(libs: Lib[]) {
  await writeText(`${await pluginDir()}/libraries.json`, JSON.stringify(libs, null, 1));
}

// ---------- scanning a library folder ----------
const natural = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');
const extOf = (n: string) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

// "Title Vol 2 (Ch 35-66)", "Title - Volume 02", "Title Part 3", "Title Book 1"
const VOL_RE = /^(.*?)[\s._-]*\b(?:vol(?:ume)?|part|book|tome)\.?[\s._-]*0*(\d+)\b(.*)$/i;

export async function scanLibrary(root: string): Promise<Book[]> {
  const books: Book[] = [];
  const walk = async (dir: string, rel: string, depth: number) => {
    const entries = await listDir(dir);
    const files = entries.filter(e => !e.isDir && BOOK_EXT.includes(extOf(e.name)));
    // group volumes of the same title in this folder
    const groups: {[t: string]: {n: number; label: string; path: string}[]} = {};
    const singles: typeof files = [];
    for (const f of files) {
      const m = stripExt(f.name).match(VOL_RE);
      if (m && m[1].trim()) {
        const t = m[1].trim();
        (groups[t] = groups[t] || []).push({n: parseInt(m[2], 10), label: m[3].trim().replace(/^[-–—\s]+/, ''), path: f.path});
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
        vols: vols.map(v => ({n: v.n, label: v.label, path: v.path})),
        ext: extOf(vols[0].path),
      });
    }
    for (const f of singles) {
      books.push({key: `${rel}/${f.name}`, fileTitle: stripExt(f.name), folder, files: [f.path], vols: [], ext: extOf(f.name)});
    }
    if (depth < 6) {
      for (const d of entries.filter(e => e.isDir && !e.name.startsWith('_') && !e.name.startsWith('.'))) {
        await walk(d.path, rel ? `${rel}/${d.name}` : d.name, depth + 1);
      }
    }
  };
  await walk(root, '', 0);
  books.sort((a, b) => natural(a.fileTitle.replace(/^(the|a|an)\s+/i, ''), b.fileTitle.replace(/^(the|a|an)\s+/i, '')));
  return books;
}

// ---------- saved details, kept inside the library folder ----------
export async function loadMeta(root: string): Promise<MetaStore> {
  const t = await readText(`${root}/${DATA_DIR}/library.json`);
  try {
    const m = t ? JSON.parse(t) : null;
    if (m && m.books) return m;
  } catch (e) {}
  return {version: 1, books: {}};
}

export async function saveMeta(root: string, meta: MetaStore): Promise<boolean> {
  return writeText(`${root}/${DATA_DIR}/library.json`, JSON.stringify(meta, null, 1));
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
    p = await extractEpubCover(b.files[0], `${root}/${DATA_DIR}/covers/${hash(b.key)}.img`);
  }
  cache[b.key] = p;
  return p;
}
