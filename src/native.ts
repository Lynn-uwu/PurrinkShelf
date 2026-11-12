// Thin wrapper around InkShelf's native module (android/app/src/main/java/com/inkshelf).
import {NativeModules} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';

export type Entry = {name: string; path: string; isDir: boolean; size: number; mtime?: number};

const N: any = NativeModules.InkShelf;

export const hasNative = () => !!N;

export async function listDir(path: string): Promise<Entry[]> {
  if (!N) return [];
  try {
    return (await N.listDir(path)) || [];
  } catch (e) {
    return [];
  }
}

export async function readText(path: string): Promise<string | null> {
  if (!N) return null;
  try {
    return await N.readText(path);
  } catch (e) {
    return null;
  }
}

export async function writeText(path: string, text: string): Promise<boolean> {
  if (!N) return false;
  try {
    return !!(await N.writeText(path, text));
  } catch (e) {
    return false;
  }
}

export async function extractEpubCover(epub: string, out: string): Promise<string | null> {
  if (!N) return null;
  try {
    return await N.extractEpubCover(epub, out);
  } catch (e) {
    return null;
  }
}

/**
 * Open a book in Supernote's reader.
 * Tries, in order: the Document reader directly, the file browser, then the plugin kit.
 * Returns null on success (as far as Android can tell), or an explanation.
 */
export async function openBook(path: string, how: 'reader' | 'explorer' | 'kit' = 'reader'): Promise<string | null> {
  try {
    if (how === 'kit') {
      const r: any = await PluginFileAPI.openFile(path, -1);
      if (r && r.success === false) return r.error?.message || 'The reader refused the book.';
    } else {
      if (!N) return 'InkShelf was installed without its native part.';
      await N.openDocument(path, how);
    }
    setTimeout(() => {
      PluginManager.closePluginView().catch(() => {});
    }, 600);
    return null;
  } catch (e: any) {
    return e?.message || String(e);
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (!N) return false;
  try {
    return !!(await N.copyText(text));
  } catch (e) {
    return false;
  }
}

const ok = (r: any) => r && r.success !== false;

/** Is InkShelf open on top of a note (so we can paste into it)? */
/** the document open behind InkShelf right now (a book or a note) */
export async function currentFile(): Promise<string | null> {
  try {
    const r: any = await PluginCommAPI.getCurrentFilePath();
    const p = r?.result ?? r;
    return typeof p === 'string' && p ? p : null;
  } catch (e) {
    return null;
  }
}
export async function currentNote(): Promise<string | null> {
  try {
    const r: any = await PluginCommAPI.getCurrentFilePath();
    const p = r?.result ?? r;
    return typeof p === 'string' && /\.note$/i.test(p) ? p : null;
  } catch (e) {
    return null;
  }
}

/**
 * Paste a book into the note InkShelf was opened from: its cover and/or a text box.
 * Returns null when it worked, or what went wrong.
 */
export async function pasteIntoNote(opts: {cover?: string | null; coverOut: string; text?: string}): Promise<string | null> {
  if (!(await currentNote())) return 'Open InkShelf from a note (the toolbar inside a note) to paste into it. The text is on the clipboard instead.';
  try {
    if (opts.cover && N) {
      const png = await N.prepareImage(opts.cover, opts.coverOut, 600);
      if (!png) return "Couldn't read this book's cover.";
      const r: any = await PluginNoteAPI.insertImage(png);
      if (!ok(r)) return r?.error?.message || "The note didn't take the picture.";
    }
    if (opts.text) {
      let w = 1404;
      try {
        const s: any = await PluginCommAPI.getPageDisplaySize();
        w = s?.result?.width || s?.width || w;
      } catch (e) {}
      const lines = opts.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 48)), 0);
      const r: any = await PluginNoteAPI.insertText({
        textContentFull: opts.text,
        textRect: {left: Math.round(w * 0.08), top: 180, right: Math.round(w * 0.92), bottom: 180 + Math.min(1500, lines * 52 + 40)},
        fontSize: 32,
        textAlign: 0,
        textBold: 0,
        textItalics: 0,
        textFrameWidthType: 0,
      });
      if (!ok(r)) return r?.error?.message || "The note didn't take the text.";
    }
    setTimeout(() => PluginManager.closePluginView().catch(() => {}), 300);
    return null;
  } catch (e: any) {
    return e?.message || String(e);
  }
}

export type Root = {path: string; label: string; readable: boolean};
/** SD cards etc., found with Android's storage APIs (never the plugin kit's call). */
export async function storageRoots(): Promise<{roots: Root[]; how: string}> {
  if (!N?.storageRoots) return {roots: [], how: 'no native'};
  try {
    const r = await N.storageRoots();
    return {roots: r?.roots || [], how: r?.how || ''};
  } catch (e: any) {
    return {roots: [], how: 'failed: ' + (e?.message || e)};
  }
}

/** Shrink and copy a picture (PNG out), so a chosen cover stays even if the original is deleted. */
export async function copyImage(src: string, out: string, maxSide = 900): Promise<string | null> {
  if (!N?.prepareImage) return null;
  try {
    return (await N.prepareImage(src, out, maxSide)) || null;
  } catch (e) {
    return null;
  }
}

/** Supernote's screenshot folder (where pictures for covers usually are). */
export async function screenshotDir(): Promise<string> {
  const home = '/storage/emulated/0';
  const names = (await listDir(home)).filter(e => e.isDir).map(e => e.name);
  const hit = names.find(n => /^screenshots?$/i.test(n)) || names.find(n => /^(pictures|export)$/i.test(n));
  return hit ? `${home}/${hit}` : `${home}/SCREENSHOT`;
}

/** Save a zip from {name: text} (used for the .xlsx sheet). */
export async function writeZip(path: string, entries: {[name: string]: string}): Promise<boolean> {
  if (!N?.writeZip) return false;
  try {
    return !!(await N.writeZip(path, entries));
  } catch (e) {
    return false;
  }
}
/** The text files inside a zip, or null. */
export async function readZip(path: string): Promise<{[name: string]: string} | null> {
  if (!N?.readZip) return null;
  try {
    return (await N.readZip(path)) || null;
  } catch (e) {
    return null;
  }
}

/** title/author/description/language/subjects written inside an EPUB */
export type OpfMeta = {title?: string; author?: string; description?: string; language?: string; subjects: string[]; series?: string; seriesNo?: number; rating?: number; words?: number; cjk?: number};
/** the details in an OPF file (inside an EPUB, or Calibre's metadata.opf next to a book) */
export function parseOpf(opf: string): OpfMeta {
  const un = (t: string) =>
    t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const all = (tag: string) => Array.from(opf.matchAll(new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'gi'))).map(m => un(m[1])).filter(Boolean);
  const metaOf = (name: string) => {
    const m = opf.match(new RegExp(`<meta\\b[^>]*name="${name}"[^>]*>`, 'i'));
    return m?.[0].match(/content="([^"]*)"/i)?.[1];
  };
  const langs: {[k: string]: string} = {zh: 'Chinese', ko: 'Korean', ja: 'Japanese', en: 'English', es: 'Spanish', fr: 'French', de: 'German', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai', ru: 'Russian', pt: 'Portuguese'};
  const l = (all('language')[0] || '').toLowerCase().slice(0, 2);
  const author = all('creator').filter(a => !/^(unknown|anonymous|calibre)/i.test(a))[0];
  const series = metaOf('calibre:series');
  const idx = Number(metaOf('calibre:series_index'));
  const rating = Number(metaOf('calibre:rating'));
  return {
    title: all('title')[0], author, description: all('description')[0], language: langs[l], subjects: all('subject'),
    series: series ? un(series) : undefined, seriesNo: series && idx > 0 ? idx : undefined, rating: rating > 0 ? Math.max(1, Math.min(5, Math.round(rating / 2))) : undefined,
  };
}
export async function epubMeta(path: string): Promise<OpfMeta | null> {
  if (!N?.readEpubMeta) return null;
  let opf: string | null = null;
  try {
    opf = await N.readEpubMeta(path);
  } catch (e) {}
  if (!opf) return null;
  const m = parseOpf(opf);
  try {
    if (N.epubWords) {
      const w = await N.epubWords(path);
      // words (Korean too: it has spaces); Chinese/Japanese characters are counted one by one
      if (w) {
        m.words = Math.round(Number(w.words) || 0);
        m.cjk = Math.round(Number(w.cjk) || 0);
      }
    }
  } catch (e) {}
  return m;
}
/** opens the device's file manager app; returns its name, or null when there isn't one to open */
export async function openFileManager(): Promise<string | null> {
  if (!N?.openFileManager) return null;
  try {
    return (await N.openFileManager()) || null;
  } catch (e) {
    return null;
  }
}

/** delete a paper-book listing (a .paper file InkShelf made); real books are never deleted */
export async function removePaper(path: string): Promise<boolean> {
  if (!N?.removePaper || !path.endsWith('.paper')) return false;
  try {
    return !!(await N.removePaper(path));
  } catch (e) {
    return false;
  }
}
