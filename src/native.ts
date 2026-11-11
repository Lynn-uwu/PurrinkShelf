// Thin wrapper around InkShelf's native module (android/app/src/main/java/com/inkshelf).
import {NativeModules} from 'react-native';
import {PluginFileAPI, PluginManager} from 'sn-plugin-lib';

export type Entry = {name: string; path: string; isDir: boolean; size: number};

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
