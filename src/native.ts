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
      setTimeout(() => {
        PluginManager.closePluginView().catch(() => {});
      }, 600);
    } else {
      if (!N) return 'InkShelf was installed without its native part.';
      // Close InkShelf first, then open the book. Closing after the book opened left
      // Supernote thinking InkShelf was still showing, so the next tap was swallowed.
      await PluginManager.closePluginView().catch(() => {});
      await new Promise(r => setTimeout(r, 250));
      try {
        await N.openDocument(path, how);
      } catch (e) {
        PluginManager.showPluginView().catch(() => {}); // come back so the message can be read
        throw e;
      }
    }
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
