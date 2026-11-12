// A small trouble log the user can find and send: Document/PurrinkShelf/PurrinkShelf-log.txt on the Supernote.
import {NativeModules} from 'react-native';

export const LOG_PATH = '/storage/emulated/0/Document/PurrinkShelf/PurrinkShelf-log.txt';
const N: any = NativeModules.InkShelf;
const recent: string[] = [];

const stamp = () => {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
};

export function log(...parts: any[]) {
  const line = `${stamp()}  ${parts.map(p => (typeof p === 'string' ? p : safe(p))).join(' ')}`;
  recent.push(line);
  if (recent.length > 60) recent.shift();
  try {
    N?.appendText(LOG_PATH, line + '\n').catch(() => {});
  } catch (e) {}
}

export const recentLog = () => recent.slice();

function safe(x: any) {
  try {
    if (x instanceof Error) return `${x.name}: ${x.message}\n${x.stack || ''}`;
    return JSON.stringify(x);
  } catch (e) {
    return String(x);
  }
}

// ---- catching errors so PurrinkShelf shows them instead of closing ----
type Fn = (e: {message: string; stack?: string}) => void;
let onError: Fn | null = null;
let pending: {message: string; stack?: string} | null = null;
export function setErrorScreen(f: Fn) {
  onError = f;
  if (pending) f(pending);
}
export function reportError(e: any, where: string) {
  const err = {message: `${where}: ${e?.message || String(e)}`, stack: e?.stack};
  log('ERROR', err.message, err.stack || '');
  if (onError) onError(err);
  else pending = err;
}

export function installGlobalHandler() {
  const EU: any = (global as any).ErrorUtils;
  if (!EU?.setGlobalHandler) return;
  EU.setGlobalHandler((e: any, fatal: boolean) => reportError(e, fatal ? 'Crash' : 'Error'));
  // promises that fail with nobody listening
  const t: any = (global as any).HermesInternal?.enablePromiseRejectionTracker;
  if (t) t({allRejections: true, onUnhandled: (_id: number, e: any) => reportError(e, 'Unhandled')});
}
