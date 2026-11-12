/**
 * InkShelf - a library for the Supernote.
 * Pick any folder as a library; books are listed by file name; add titles, tags,
 * descriptions and covers on the device; filter by folder and tag; tap to read.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {PluginManager, RattaFileSelector as FileSelector} from 'sn-plugin-lib';
import {Collection as Coll, COLLECTION_TEMPLATES, READ_STATES, ReadState, RULE_FIELDS, Rule, RuleField, STARTER_COLLECTIONS, inCollection, readLabel, setReading, timesRead} from './src/library';
import {AppState, Book, DEFAULT_SETTINGS, EMPTY_STATE, Lib, MAX_NOTES, Meta, MetaStore, Note, NoteColor, Settings, Snap, SortBy, Vol, arrange, catsOf, folderCats, hasDetails, missingBooks, needsDetails, norm, reconcile, pluginFile, readOnlyLibs, Backup, BACKUP_NAME, DEFAULT_BACKUP_DIR, isSetUp, readBackup, restoreMeta, writeBackup, coverFor, loadCache, loadLibraries, loadMeta, loadSettings, loadState, saveLibraries, saveMeta, saveSettings, saveState, scanLibrary} from './src/library';
import {on} from './src/events';
import {HELP, HelpTopic, searchHelp} from './src/help';
import {SHEET_NAME, list as cells, parseCsv} from './src/sheet';
import {makeWorkbook, readWorkbook} from './src/xlsx';
const XLSX_NAME = 'InkShelf books.xlsx';
import {LOG_PATH, installGlobalHandler, log, recentLog, reportError, setErrorScreen} from './src/log';
import {ICONS, IconName} from './src/icons';
import {readText, readZip, writeZip} from './src/native';
import {Entry, copyImage, copyText, hasNative, listDir, openBook, pasteIntoNote, screenshotDir, storageRoots} from './src/native';

const {width: W, height: H} = Dimensions.get('window');
const S = Math.min(W, H) / 702; // designed for a 702-wide screen, then scaled
const px = (n: number) => Math.round(n * S);
const BLACK = '#000000';
const LIST_PER_PAGE = 6;
const TASK_H = px(80);
const GRID_PER_PAGE = 12;
const READ = 'plugin.permission.FILE:READ';
const WRITE = 'plugin.permission.FILE:WRITE';

type Screen =
  | {kind: 'home'}
  | {kind: 'bookmarks'}
  | {kind: 'new'}
  | {kind: 'gallery'; what: 'recent' | 'genres'}
  | {kind: 'libraries'}
  | {kind: 'missing'}
  | {kind: 'browse'; path: string | null; for?: 'backup' | 'restore'}
  | {kind: 'pickroot'; file: string}
  | {kind: 'library'}
  | {kind: 'book'; key: string; from?: From}
  | {kind: 'edit'; key: string; from?: From; viaBook?: boolean}
  | {kind: 'coledit'; id: string | null}
  | {kind: 'help'; topic?: string}
  | {kind: 'exclude'; lib: string; path: string};
type From = 'home' | 'bookmarks' | 'library' | 'new';
/** one book anywhere in any library */
type Found = {lib: Lib; book: Book; meta: Meta; isNew?: boolean};
type TagState = {[t: string]: 1 | -1}; // keys are "g:Genre", "t:Tag", "c:Category" or "f:flag"
type FilterKind = 'g' | 't' | 'c';

const PERMS: {id: string; icon: IconName; label: string; why: string}[] = [
  {id: READ, icon: 'library', label: 'Read files', why: 'Find the books in your library folders'},
  {id: WRITE, icon: 'save', label: 'Write files', why: 'Save tags, notes, covers and the backup'},
];
/** 0 = not allowed, 1 = this time only, 2 = always */
async function permStatus(): Promise<{[p: string]: number}> {
  const r: {[p: string]: number} = {};
  for (const p of PERMS) {
    try {
      r[p.id] = Number(await PluginManager.hasPermission(p.id)) || 0;
    } catch (e) {
      r[p.id] = 2; // this Supernote doesn't use plugin permissions
    }
  }
  return r;
}

// ---------- small building blocks ----------
function Btn({label, icon, onPress, dark, small, style, a11y}: {label?: string; icon?: IconName; onPress: () => void; dark?: boolean; small?: boolean; style?: any; a11y?: string}) {
  return (
    <Pressable onPress={onPress} hitSlop={px(6)} accessibilityRole="button" accessibilityLabel={a11y || label} style={[st.btn, small && st.btnSmall, dark && st.btnDark, {flexDirection: 'row', justifyContent: 'center'}, style]}>
      {icon ? <Icon name={icon} size={small ? px(24) : px(28)} color={dark ? '#ffffff' : BLACK} /> : null}
      {label ? <Text style={[st.btnText, small && st.btnTextSmall, dark && {color: '#ffffff'}, icon && {marginLeft: px(8)}]}>{label}</Text> : null}
    </Pressable>
  );
}

function Icon({name, size, color}: {name: IconName; size?: number; color?: string}) {
  const sz = size || px(26);
  return <Image source={ICONS[name]} style={{width: sz, height: sz, tintColor: color || BLACK}} />;
}

/** a round icon button; "bare" drops the outline */
function IconBtn({name, onPress, label, dark, bare, size, iconSize, disabled, style, onLongPress}: {
  name: IconName;
  onPress: () => void;
  label: string; // read out by screen readers, not shown
  dark?: boolean;
  bare?: boolean;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: any;
  onLongPress?: () => void;
}) {
  const sz = size || px(46);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={px(6)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{width: sz, height: sz, borderRadius: sz / 2, alignItems: 'center', justifyContent: 'center'}, !bare && st.iconRing, dark && st.btnDark, disabled && st.dim, style]}>
      <Icon name={name} size={iconSize || Math.round(sz * 0.56)} color={dark ? '#ffffff' : BLACK} />
    </Pressable>
  );
}

function Pill({label, onPress, active, small}: {label: string; onPress?: () => void; active?: boolean; small?: boolean}) {
  return (
    <Pressable onPress={onPress} hitSlop={px(4)} style={[st.pill, small && st.pillSmall, active && st.pillActive]}>
      <Text style={[st.pillText, small && {fontSize: px(14)}, active && {color: '#ffffff'}]}>{label}</Text>
    </Pressable>
  );
}

function Cover({uri, w, h, title, isNew, badge}: {uri?: string | null; w: number; h: number; title?: string; isNew?: boolean; badge?: string}) {
  const [bad, setBad] = useState(false);
  const img =
    !uri || bad ? (
      <View style={[st.noCover, {width: w, height: h}]}>
        {title ? <Text style={[st.noCoverText, {fontSize: Math.max(px(9), Math.round(w / 9))}]} numberOfLines={5}>{title}</Text> : null}
      </View>
    ) : (
      <Image source={{uri: /^[a-z]+:/i.test(uri) ? uri : 'file://' + uri}} style={{width: w, height: h}} resizeMode="cover" onError={() => setBad(true)} />
    );
  const tag = badge || (isNew ? 'NEW' : '');
  if (!tag) return img;
  return (
    <View style={{width: w, height: h}}>
      {img}
      <View style={st.newBadge}><Text style={[st.newBadgeText, badge ? {fontSize: Math.max(px(9), Math.min(px(11), Math.round(w / 11))), letterSpacing: 0} : null]}>{tag}</Text></View>
    </View>
  );
}

function ViewIcon({kind, on, onPress}: {kind: 'list' | 'grid'; on: boolean; onPress: () => void}) {
  return <IconBtn name={kind} label={kind === 'list' ? 'List view' : 'Grid view'} dark={on} onPress={onPress} size={px(44)} style={{marginLeft: px(8), borderRadius: px(10)}} />;
}

function FilterRow({label, count, state, onPress}: {label: string; count: number; state: 0 | 1 | -1; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={st.fRow} hitSlop={px(2)}>
      <View style={[st.box, state === 1 && st.btnDark, state === -1 && {borderStyle: 'dashed'}]}>
        <Text style={[st.boxMark, state === 1 && {color: '#ffffff'}]}>{state === 1 ? '✓' : state === -1 ? '✕' : ' '}</Text>
      </View>
      <Text style={[st.fLabel, state === -1 && {textDecorationLine: 'line-through'}, count === 0 && state === 0 && {color: '#999999'}]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={st.fCount}>{count}</Text>
    </Pressable>
  );
}

function Header({left, title, onLeft, right, onHelp}: {left?: string; title: string; onLeft?: () => void; right?: React.ReactNode; onHelp?: () => void}) {
  return (
    <View style={st.header}>
      <View style={{minWidth: px(110), flexDirection: 'row'}}>
        {left && onLeft ? <IconBtn bare name="back" label={left} onPress={onLeft} iconSize={px(30)} /> : null}
        {onHelp ? <IconBtn bare name="help" label="How to use InkShelf" onPress={onHelp} iconSize={px(30)} /> : null}
      </View>
      <Text style={st.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{minWidth: px(110), flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center'}}>
        {right}
        <CloseBtn />
      </View>
    </View>
  );
}
const CloseBtn = () => <IconBtn bare name="close" label="Close InkShelf" onPress={() => PluginManager.closePluginView()} iconSize={px(30)} />;

// ---------- the app ----------
installGlobalHandler();

/** Shows what went wrong instead of letting InkShelf close, so it can be reported. */
class Guard extends React.Component<{children: React.ReactNode}, {err: {message: string; stack?: string} | null}> {
  state = {err: null as {message: string; stack?: string} | null};
  componentDidMount() {
    setErrorScreen(err => this.setState({err}));
  }
  static getDerivedStateFromError(e: any) {
    return {err: {message: `Screen: ${e?.message || String(e)}`, stack: e?.stack}};
  }
  componentDidCatch(e: any) {
    log('ERROR', 'Screen:', e?.message || String(e), e?.stack || '');
  }
  render() {
    const err = this.state.err;
    if (!err) return this.props.children;
    return (
      <View style={[st.screen, {padding: px(24)}]}>
        <Text style={st.h2}>Something went wrong</Text>
        <Text style={[st.para, {fontSize: px(18)}]}>{'InkShelf stopped this instead of closing. A photo of this screen helps fix it.'}</Text>
        <View style={{borderWidth: 1.5, borderColor: BLACK, borderRadius: px(10), padding: px(12), marginVertical: px(12)}}>
          <Text style={{fontSize: px(17), fontWeight: 'bold', color: BLACK}}>{err.message}</Text>
          <Text style={{fontSize: px(12), color: '#333333', marginTop: px(6)}} numberOfLines={10}>{err.stack || ''}</Text>
        </View>
        <Text style={st.small}>{'Last steps:'}</Text>
        <Text style={{fontSize: px(12), color: '#333333'}} numberOfLines={12}>{recentLog().slice(-12).join('\n')}</Text>
        <Text style={[st.small, {marginTop: px(10)}]}>{`Full log: ${LOG_PATH.replace('/storage/emulated/0/', '')}`}</Text>
        <View style={{flexDirection: 'row', marginTop: px(16)}}>
          <Btn dark icon="home" label="Back to Home" onPress={() => this.setState({err: null})} style={{flex: 1, marginRight: px(10)}} />
          <Btn icon="close" a11y="Close InkShelf" onPress={() => PluginManager.closePluginView()} />
        </View>
      </View>
    );
  }
}

export default function App(): React.JSX.Element {
  return (
    <Guard>
      <InkShelfApp />
    </Guard>
  );
}

function InkShelfApp(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
  const [app, setApp] = useState<AppState>(EMPTY_STATE);
  useEffect(() => {
    log('screen', screen.kind, (screen as any).path || (screen as any).key || '');
  }, [screen]);
  const [showSettings, setShowSettings] = useState(false);
  const [libs, setLibs] = useState<Lib[]>([]);
  const [lib, setLib] = useState<Lib | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [meta, setMeta] = useState<MetaStore>({version: 1, books: {}});
  const [covers, setCovers] = useState<{[k: string]: string | null}>({});
  const coverCache = useRef<{[k: string]: string | null}>({});
  const [message, setMessage] = useState<string | null>(null);
  // a short note at the bottom that goes away by itself (never blocks the page)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const say = (t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const [scanning, setScanning] = useState<{[path: string]: boolean}>({});

  // filters (Mihon-style sheet: Filter, Category, Tags, Sort, Display)
  const [tags, setTags] = useState<TagState>({});
  const [mode, setMode] = useState<'all' | 'any'>('all');
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<SheetTab | null>(null); // sort and display
  const [cat, setCat] = useState<string | null>(null); // category picked at the top (null = All)
  const [catOpen, setCatOpen] = useState(false);
  const [fKind, setFKind] = useState<'g' | 't' | 'f'>('g'); // filter panel: Genre, Tags, More
  const [tPage, setTPage] = useState(1);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const changeSettings = (patch: Partial<Settings>) => {
    setSettings(cur => {
      const n = {...cur, ...patch};
      saveSettings(n);
      return n;
    });
  };
  const grid = settings.libraryGrid;
  const setGrid = (v: boolean) => changeSettings({libraryGrid: v});
  const isGrid = (page: string) => settings.views?.[page] === 'grid';
  const setGridFor = (page: string) => (g: boolean) => setSettings(cur => {
    const n = {...cur, views: {...cur.views, [page]: g ? 'grid' : 'list'} as Settings['views']};
    saveSettings(n);
    return n;
  });
  const volGrid = settings.volumeGrid;
  const setVolGrid = (v: boolean) => changeSettings({volumeGrid: v});
  const changeApp = (f: (a: AppState) => AppState) => {
    setApp(cur => {
      const n = f(cur);
      saveState(n);
      return n;
    });
  };

  // ---------- permissions: one card that asks for everything InkShelf needs ----------
  const [perm, setPerm] = useState<{[p: string]: number}>({});
  const [permOpen, setPermOpen] = useState(false);
  const saveWarned = useRef(false);
  async function allowAll() {
    for (const p of PERMS) {
      if ((perm[p.id] || 0) >= 1) continue; // already allowed: don't make Supernote ask again
      try {
        await PluginManager.requestPermission(p.id, `InkShelf needs this to ${p.why.toLowerCase()}.`);
      } catch (e) {}
    }
    const r = await permStatus();
    setPerm(r);
    log('permissions after asking', r);
    if (Object.values(r).every(v => v >= 1)) {
      setPermOpen(false);
      await loadAll();
    }
  }

  useEffect(() => {
    (async () => {
      log('InkShelf started', hasNative() ? 'native ok' : 'NO NATIVE MODULE');
      const pr = await permStatus();
      setPerm(pr);
      log('permissions', pr);
      if (Object.values(pr).some(v => v < 1)) setPermOpen(true); // one InkShelf card asks for all of them
      // a fresh install: bring everything back from the backup file, if there is one
      if (!(await isSetUp())) {
        const bk = await readBackup(DEFAULT_BACKUP_DIR);
        if (bk) await restoreFrom(bk, DEFAULT_BACKUP_DIR);
      }
      await loadAll();
      ready.current = true;
    })();
    // Supernote's own settings entry for InkShelf opens the settings sheet
    return on('settings', () => setShowSettings(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setSettings(await loadSettings());
    setApp(await loadState());
    const l = await loadLibraries();
    // what was found last time shows at once; each library then refreshes quietly
    const cached: {[p: string]: {books: Book[]; meta: MetaStore}} = {};
    for (const x of l) {
      const c = await loadCache(x.path);
      if (c) cached[x.path] = c;
    }
    setLibData(d => ({...d, ...cached}));
    setLibs(l);
  }
  async function restoreFromFolder(dir: string) {
    const bk = await readBackup(dir);
    if (!bk) {
      setMessage(`There's no "${BACKUP_NAME}" in that folder.`);
      return false;
    }
    ready.current = false;
    await restoreFrom(bk, dir);
    await loadAll();
    if (lib) {
      const c = await loadCache(lib.path);
      const m = await loadMeta(lib.path);
      if (c) setBooks(c.books);
      setMeta(m);
    }
    ready.current = true;
    return true;
  }

  // ---------- backup file (Document/InkShelf by default): everything InkShelf wrote ----------
  const ready = useRef(false); // never write a backup before the saved data has been read
  const indexReadyRef = useRef(false);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  async function restoreFrom(bk: Backup, dir: string) {
    log('restore from backup', dir, new Date(bk.savedAt).toISOString());
    // merged with whatever is there now, so restoring never loses anything
    const curLibs = await loadLibraries();
    await saveLibraries([...curLibs, ...bk.libraries.filter(l => !curLibs.some(c => c.path === l.path))]);
    if (!curLibs.length) await saveSettings({...DEFAULT_SETTINGS, ...bk.settings, backupDir: dir});
    const cur = await loadState();
    const uniq = (list: Snap[]) => list.filter((x, i) => list.findIndex(y => y.lib === x.lib && y.key === x.key) === i);
    const bs = bk.state || EMPTY_STATE;
    await saveState({
      ...bs,
      ...cur,
      recent: uniq([...cur.recent, ...(bs.recent || [])]).slice(0, 12),
      bookmarks: uniq([...cur.bookmarks, ...(bs.bookmarks || [])]),
      searches: Array.from(new Set([...cur.searches, ...(bs.searches || [])])).slice(0, 6),
      knownRoots: Array.from(new Set([...(cur.knownRoots || []), ...(bs.knownRoots || [])])),
    });
    for (const l of bk.libraries) if (bk.metas?.[l.path]) await restoreMeta(l.path, bk.metas[l.path]);
    say(`Restored ${bk.libraries.length} librar${bk.libraries.length === 1 ? 'y' : 'ies'} and their details from the backup (${new Date(bk.savedAt).toLocaleDateString()})`);
  }
  const backupTimer = useRef<any>(null);
  const backupNow = async () => {
    const metas: {[p: string]: MetaStore} = {};
    for (const l of libs) {
      const d = l.path === lib?.path ? {meta} : libData[l.path];
      if (d) metas[l.path] = d.meta;
    }
    const ok = await writeBackup(settings.backupDir || DEFAULT_BACKUP_DIR, {libraries: libs, settings, state: app, metas});
    if (ok) setLastBackup(Date.now());
    if (indexReadyRef.current) await syncSheet().catch(e => log('sheet failed', String(e)));
    else log('backup failed', settings.backupDir);
    return ok;
  };

  const metaOf = (b: Book): Meta => meta.books[b.key] || {};
  const titleOf = (b: Book) => metaOf(b).title || b.fileTitle;

  const lastBase = useRef<Screen>({kind: 'home'}); // the page under a card (Data and storage)
  const libRef = useRef<Lib | null>(null);
  libRef.current = lib;
  async function openLibrary(l: Lib, then?: Screen, filter?: TagState) {
    log('open library', l.path);
    setLib(l);
    libRef.current = l;
    coverCache.current = {};
    setCovers({});
    setTags(filter || {});
    setCat(null);
    setPage(1);
    // show what InkShelf saw last time straight away, then look for changes quietly
    const have = libData[l.path] || (await loadCache(l.path));
    setBooks(have?.books || []);
    setMeta(have?.meta || {version: 1, books: {}});
    setScreen(then || {kind: 'library'});
    changeApp(a => ({...a, lastLib: l.path}));
    if (Date.now() - (lastScanAt.current[l.path] || 0) > 60000) quietScan(l);
  }

  // ---------- scanning: find every book, notice what's new (like a game list refresh) ----------
  const raws = useRef<{[path: string]: Book[]}>({});
  const lastScanAt = useRef<{[path: string]: number}>({});
  /** turn a raw scan into books (series, combined books) and compare with last time */
  async function settle(l: Lib, raw: Book[], m0: MetaStore) {
    const bs = arrange(l.path, raw, m0);
    const r = reconcile(l.path, bs, m0, settingsRef.current.missing);
    await saveMeta(l.path, r.meta, bs);
    if (r.relinked.length) {
      const map = Object.fromEntries(r.relinked);
      const fix = (list: Snap[]) => list.map(x => (x.lib === l.path && map[x.key] ? {...x, key: map[x.key]} : x));
      changeApp(a => ({...a, recent: fix(a.recent), bookmarks: fix(a.bookmarks)}));
      log('reconnected', r.relinked);
    }
    setLibData(d => ({...d, [l.path]: {books: bs, meta: r.meta}}));
    if (libRef.current?.path === l.path) {
      setBooks(bs);
      setMeta(r.meta);
    }
    return {...r, books: bs};
  }
  async function scanLib(l: Lib) {
    setScanning(x => ({...x, [l.path]: true}));
    lastScanAt.current[l.path] = Date.now();
    try {
      const [raw, m0] = await Promise.all([scanLibrary(l.path, l.exclude), loadMeta(l.path)]);
      if (!raw.length && !(await listDir(l.path)).length) {
        // the folder isn't there (card out?): keep everything as it was
        log('library offline', l.path);
        return null;
      }
      raws.current[l.path] = raw;
      const r = await settle(l, raw, m0);
      if (r.added.length || r.removed) log('scan', l.name, '+' + r.added.length, '-' + r.removed);
      return r;
    } finally {
      setScanning(x => ({...x, [l.path]: false}));
    }
  }
  async function quietScan(l: Lib) {
    try {
      const r = await scanLib(l);
      if (r && r.added.length) say(`${r.added.length} new book${r.added.length === 1 ? '' : 's'} in ${l.name}`);
    } catch (e) {
      log('scan failed', l.path, String(e));
    }
  }
  async function refreshAll(only?: Lib) {
    const list = only ? [only] : libs;
    if (!list.length) return;
    say(only ? `Checking ${only.name} for new books` : 'Checking your libraries for new books');
    const lines: string[] = [];
    try {
      for (const l of list) {
        const r = await scanLib(l);
        if (!r) { lines.push(`${l.name}: not found (is the card in?)`); continue; }
        const extra = [r.added.length ? `${r.added.length} new` : '', r.removed ? `${r.removed} gone` : '', r.missingCount ? `${r.missingCount} missing link${r.missingCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
        lines.push(`${l.name}: ${r.books.length} books${extra ? ', ' + extra : ''}`);
      }
    } catch (e) {
      reportError(e, 'Refreshing');
    }
    say(lines.join('  ·  '));
  }
  /** change how files are combined into books, then show the result at once */
  async function regroup(l: Lib, change: (m: MetaStore) => MetaStore) {
    const d = l.path === lib?.path ? {meta} : libData[l.path];
    const m = change(d?.meta || (await loadMeta(l.path)));
    const raw = raws.current[l.path];
    if (raw) await settle(l, raw, m);
    else {
      await saveMeta(l.path, m);
      await scanLib(l);
    }
  }
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const markSeen = (b: Book) => {
    const cur = metaRef.current;
    if (!lib || !cur.newKeys?.includes(b.key)) return;
    const m = {...cur, newKeys: cur.newKeys.filter(k => k !== b.key)};
    metaRef.current = m;
    setMeta(m);
    setLibData(d => ({...d, [lib.path]: {books, meta: m}}));
    saveMeta(lib.path, m);
  };
  async function markAllSeen() {
    for (const l of libs) {
      const d = l.path === lib?.path ? {books, meta} : libData[l.path];
      if (!d?.meta.newKeys?.length) continue;
      const m = {...d.meta, newKeys: []};
      await saveMeta(l.path, m);
      setLibData(x => ({...x, [l.path]: {books: d.books, meta: m}}));
      if (l.path === lib?.path) setMeta(m);
    }
  }

  // storage roots InkShelf has already seen (from libraries and books picked with Supernote's picker)
  const rootOf = (p: string) => (p.match(/^\/storage\/(?!emulated|self)[^/]+/) || [])[0];
  const knownRoots = Array.from(new Set([...(app.knownRoots || []), ...libs.map(l => rootOf(l.path))].filter(Boolean) as string[]));

  // ---------- adding a library: choose the folder (like adding a game folder) ----------
  function addLibrary() {
    setScreen({kind: 'browse', path: null});
  }
  // or: pick any book with Supernote's own file picker, then choose the folder above it
  async function addFromBook() {
    log('add library: system picker');
    try {
      const r: any = await FileSelector.selectFile({
        selectType: 1,
        suffixList: ['epub', 'pdf', 'cbz', 'fb2', 'xps', 'mobi', 'txt', 'docx'],
        maxNum: 1,
        title: 'Pick any book in your library',
        ...(knownRoots[0] ? {needSelectFolder: knownRoots[0]} : {}),
        rightButtonText: 'OK',
      });
      const list: any[] = Array.isArray(r) ? r : r?.result || [];
      log('picker returned', list);
      if (list.length) {
        const root = rootOf(String(list[0]));
        if (root && !(app.knownRoots || []).includes(root)) changeApp(a => ({...a, knownRoots: [...(a.knownRoots || []), root]}));
        setScreen({kind: 'pickroot', file: String(list[0])});
      }
    } catch (e) {
      log('picker failed', e);
      setScreen({kind: 'browse', path: null}); // fall back to InkShelf's own folder list
    }
  }
  async function useFolder(p: string) {
    try {
      log('use folder', p);
      const name = p === '/storage/emulated/0' ? 'Supernote' : /^\/storage\/[^/]+$/.test(p) ? 'SD card' : p.split('/').filter(Boolean).pop() || 'Library';
      const n = [...libs.filter(x => x.path !== p), {name, path: p}];
      setLibs(n);
      await saveLibraries(n);
      await openLibrary({name, path: p});
    } catch (e) {
      reportError(e, 'Adding the library');
    }
  }

  // ---------- every library at once (Home, search, Newly added, genres) ----------
  const [libData, setLibData] = useState<{[path: string]: {books: Book[]; meta: MetaStore}}>({});
  useEffect(() => {
    if (!ready.current) return;
    clearTimeout(backupTimer.current);
    backupTimer.current = setTimeout(backupNow, 4000);
  }, [libs, settings, app, libData, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const l of libs) {
        if (!alive) return;
        if (Date.now() - (lastScanAt.current[l.path] || 0) < 60000) continue;
        await quietScan(l);
      }
    })();
    return () => {
      alive = false;
    };
  }, [libs]); // eslint-disable-line react-hooks/exhaustive-deps
  // books whose file disappeared (their details are kept until the file is back)
  const missingHere = useMemo(() => (settings.missing === 'flag' ? missingBooks(meta) : []), [meta, settings.missing]);
  const shelf = useMemo(() => [...books, ...missingHere], [books, missingHere]);
  const index: Found[] = useMemo(
    () =>
      libs.flatMap(l => {
        const d = l.path === lib?.path && books.length ? {books, meta} : libData[l.path];
        return d ? d.books.map(b => ({lib: l, book: b, meta: d.meta.books[b.key] || {}, isNew: !!d.meta.newKeys?.includes(b.key)})) : [];
      }),
    [libs, lib, books, meta, libData],
  );
  // ---------- the book details sheet (Document/InkShelf/InkShelf books.xlsx), filled in on a computer ----------
  const sheetPath = `${DEFAULT_BACKUP_DIR}/${XLSX_NAME}`;
  const csvPath = `${DEFAULT_BACKUP_DIR}/${SHEET_NAME}`;
  const sheetMtime = async () => (await listDir(DEFAULT_BACKUP_DIR)).find(e => e.name === XLSX_NAME)?.mtime || 0;
  const csvMtime = async () => (await listDir(DEFAULT_BACKUP_DIR)).find(e => e.name === SHEET_NAME)?.mtime || 0;
  const N_CAT = 3, N_GENRE = 4, N_TAG = 8, N_COL = 3, N_RULE = 4;
  const nums = (base: string, n: number) => Array.from({length: n}, (_, i) => `${base} ${i + 1}`);
  const BOOK_HEAD = ['Title', 'Library', 'Folder', 'File', ...nums('Category', N_CAT), ...nums('Genre', N_GENRE), ...nums('Tag', N_TAG), 'Language', 'Status', 'Completely translated', 'Reading', 'Favourite', ...nums('Add to collection', N_COL), 'Description', 'ID'];
  const COLL_HEAD = ['Name', 'Match', ...Array.from({length: N_RULE}, (_, i) => [`Rule ${i + 1} check`, `Rule ${i + 1} is`, `Rule ${i + 1} value`]).flat(), 'ID'];
  /** n cells; anything beyond goes into the last one, separated by commas */
  const spread = (v: string[], n: number) => Array.from({length: n}, (_, i) => (i < n - 1 ? v[i] || '' : v.slice(n - 1).join(', ')));
  async function exportSheet(): Promise<boolean> {
    if (!index.length) return false;
    const uniq = (l: string[]) => Array.from(new Set(l.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const genres = uniq(index.flatMap(f => f.meta.genres || []));
    const tags = uniq(index.flatMap(f => f.meta.tags || []));
    const cats = uniq(index.flatMap(f => catsOf(f.book, f.meta)));
    const langs = uniq(['Chinese', 'Korean', 'Japanese', 'English', ...index.map(f => f.meta.language || '')]);
    const books = index.map(f => {
      const id = `${f.lib.path}|${f.book.key}`;
      return [
        f.meta.title || f.book.fileTitle,
        f.lib.name,
        f.book.dir,
        (f.book.files[0] || '').split('/').pop() + (f.book.files.length > 1 ? ` (+${f.book.files.length - 1})` : ''),
        ...spread(catsOf(f.book, f.meta), N_CAT),
        ...spread(f.meta.genres || [], N_GENRE),
        ...spread(f.meta.tags || [], N_TAG),
        f.meta.language || '',
        f.meta.status || '',
        f.meta.translated || '',
        f.meta.reading ? readLabel(f.meta.reading.state) : '',
        f.meta.fav ? 'Yes' : '',
        ...spread(collections.filter(c => c.add.includes(id)).map(c => c.name), N_COL),
        f.meta.description || '',
        id,
      ];
    });
    const colls = collections.map(c => [
      c.name,
      c.match === 'all' ? 'all rules fit' : 'any rule fits',
      ...Array.from({length: N_RULE}, (_, i) => {
        const r = c.rules[i];
        return r ? [RULE_FIELDS.find(x => x.id === r.field)?.label || r.field, r.op === 'has' ? 'is' : 'is not', r.value] : ['', '', ''];
      }).flat(),
      c.id,
    ]);
    const lists: {[h: string]: string} = {Language: 'Languages', 'Completely translated': 'Yes / No', Reading: 'Reading', Favourite: 'Yes / No'};
    nums('Category', N_CAT).forEach(h => (lists[h] = 'Categories'));
    nums('Genre', N_GENRE).forEach(h => (lists[h] = 'Genres'));
    nums('Tag', N_TAG).forEach(h => (lists[h] = 'Tags'));
    nums('Add to collection', N_COL).forEach(h => (lists[h] = 'Collections'));
    const cLists: {[h: string]: string} = {Match: 'Match'};
    for (let i = 1; i <= N_RULE; i++) Object.assign(cLists, {[`Rule ${i} check`]: 'Rule: check', [`Rule ${i} is`]: 'Rule: is', [`Rule ${i} value`]: 'Rule values'});
    const files = makeWorkbook(
      [
        {name: 'Books', headers: BOOK_HEAD, rows: books, lists, widths: BOOK_HEAD.map(h => (h === 'Title' ? 34 : h === 'Description' ? 60 : h === 'ID' ? 12 : h === 'File' ? 26 : h === 'Folder' ? 22 : 15))},
        {name: 'Collections', headers: COLL_HEAD, rows: colls, lists: cLists, widths: COLL_HEAD.map(h => (h === 'Name' ? 24 : h === 'ID' ? 10 : 16))},
      ],
      [
        {name: 'Categories', values: cats},
        {name: 'Genres', values: genres},
        {name: 'Tags', values: tags},
        {name: 'Languages', values: langs},
        {name: 'Reading', values: READ_STATES.map(x => x.label)},
        {name: 'Yes / No', values: ['Yes', 'No']},
        {name: 'Collections', values: collections.map(c => c.name)},
        {name: 'Rule: check', values: RULE_FIELDS.map(x => x.label)},
        {name: 'Rule: is', values: ['is', 'is not']},
        {name: 'Match', values: ['all rules fit', 'any rule fits']},
        {name: 'Rule values', values: uniq([...READ_STATES.map(x => x.label), 'No status', 'Yes', 'No', ...cats, ...genres, ...tags, ...langs, ...libs.map(l => l.name)])},
      ],
    );
    const ok = await writeZip(sheetPath, files);
    if (ok) {
      const t = await sheetMtime();
      changeApp(a => ({...a, sheetAt: t || Date.now()}));
    } else log('sheet: could not write', sheetPath);
    return ok;
  }
  /** a list column: the numbered cells (Tag 1, Tag 2 …) or a single "Tags" cell; null = nothing filled in */
  const groupOf = (r: {[h: string]: string}, base: string, plural: string): string[] | null => {
    const cellsIn = Object.keys(r).filter(k => k === plural || new RegExp(`^${base} \\d+$`).test(k)).map(k => (r[k] || '').trim()).filter(Boolean);
    if (!cellsIn.length) return null;
    if (cellsIn.every(v => v === '-')) return [];
    return Array.from(new Set(cellsIn.filter(v => v !== '-').flatMap(v => cells(v))));
  };
  /** what one row changes: an empty cell changes nothing, "-" clears it */
  const rowPatch = (r: {[h: string]: string}, b: Book, old: Meta): Meta => {
    const p: Meta = {};
    const v = (k: string) => (r[k] ?? '').trim();
    const clear = (k: string) => v(k) === '-';
    if (v('Title') && v('Title') !== (old.title || b.fileTitle)) p.title = clear('Title') || v('Title') === b.fileTitle ? undefined : v('Title');
    const cs = groupOf(r, 'Category', 'Categories');
    if (cs) p.categories = JSON.stringify(cs) === JSON.stringify(folderCats(b)) ? undefined : cs;
    const gs = groupOf(r, 'Genre', 'Genres');
    if (gs) p.genres = gs;
    const ts = groupOf(r, 'Tag', 'Tags');
    if (ts) p.tags = ts;
    if (v('Language')) p.language = clear('Language') ? undefined : v('Language');
    if (v('Status')) p.status = clear('Status') ? undefined : v('Status');
    if (v('Description')) p.description = clear('Description') ? undefined : v('Description');
    if (v('Completely translated')) p.translated = clear('Completely translated') ? undefined : /^(y|yes|true|1|✓)$/i.test(v('Completely translated')) ? 'Yes' : 'No';
    if (v('Favourite')) p.fav = /^(y|yes|true|1|✓|♥|x)$/i.test(v('Favourite')) ? true : undefined;
    if (v('Reading')) {
      const want = clear('Reading') ? null : READ_STATES.find(x => x.label.toLowerCase() === v('Reading').toLowerCase() || x.id === v('Reading').toLowerCase())?.id;
      if (want === null) p.reading = undefined;
      else if (want && want !== old.reading?.state) p.reading = setReading(old.reading, want);
    }
    return p;
  };
  async function importSheet(quiet = false): Promise<number> {
    // the .xlsx (or a .csv, if it was saved that way and is newer)
    let books: {[h: string]: string}[] = [];
    let colls: {[h: string]: string}[] | null = null;
    const [xt, ct] = [await sheetMtime(), await csvMtime()];
    if (ct > xt + 2000) {
      books = parseCsv((await readText(csvPath)) || '') as any;
    } else if (xt) {
      const z = await readZip(sheetPath);
      const wb = z ? readWorkbook(z) : {};
      books = wb.Books || Object.values(wb)[0] || [];
      colls = wb.Collections || null;
    }
    if (!books.length && !colls) {
      if (!quiet) setMessage(`There's no sheet yet. Tap "Make the sheet" first; it is saved as Document › InkShelf › ${XLSX_NAME}.`);
      return 0;
    }
    let changed = 0;
    // collections first (renamed or new ones can then be used in the book rows)
    let nextColls = collections;
    if (colls) {
      const fieldOf = (t: string) => RULE_FIELDS.find(x => x.label.toLowerCase() === t.toLowerCase() || x.id === t.toLowerCase())?.id;
      const list = [...collections];
      for (const r of colls) {
        const name = (r.Name || '').trim();
        if (!name) continue;
        const i = list.findIndex(c => c.id === r.ID);
        if (name === '-') { if (i >= 0) { list.splice(i, 1); changed++; } continue; }
        const rules: Rule[] = [];
        for (let k = 1; k <= N_RULE; k++) {
          const f = fieldOf(r[`Rule ${k} check`] || '');
          const val = (r[`Rule ${k} value`] || '').trim();
          if (f && val) rules.push({field: f, op: /not|n't/i.test(r[`Rule ${k} is`] || '') ? 'not' : 'has', value: val});
        }
        const match: 'all' | 'any' = /any/i.test(r.Match || '') ? 'any' : 'all';
        const base = i >= 0 ? list[i] : {id: Date.now().toString(36) + list.length, name, rules: [], match: 'all' as const, add: [], remove: []};
        const nc = {...base, name, match, rules};
        if (JSON.stringify(nc) !== JSON.stringify(base)) { changed++; if (i >= 0) list[i] = nc; else list.push(nc); }
      }
      nextColls = list;
    }
    // books
    const memb: {id: string; names: string[]}[] = [];
    for (const l of libs) {
      const mine = books.filter(r => r.ID && r.ID.slice(0, r.ID.indexOf('|')) === l.path);
      if (!mine.length) continue;
      const cur = l.path === lib?.path ? {books: shelf.filter(x => !x.missing), meta: metaRef.current} : libData[l.path];
      if (!cur) continue;
      const m: MetaStore = {...cur.meta, books: {...cur.meta.books}};
      let here = 0;
      for (const r of mine) {
        const key = r.ID!.slice(r.ID!.indexOf('|') + 1);
        const b = cur.books.find(x => x.key === key);
        if (!b) continue;
        const names = groupOf(r, 'Add to collection', 'Collections');
        if (names) memb.push({id: r.ID!, names});
        const old = m.books[key] || {};
        const next = {...old, ...rowPatch(r, b, old)};
        if (JSON.stringify(next) !== JSON.stringify(old)) {
          m.books[key] = next;
          here++;
        }
      }
      changed += here;
      if (!here) continue;
      await saveMeta(l.path, m, cur.books);
      setLibData(d => ({...d, [l.path]: {books: cur.books, meta: m}}));
      if (l.path === lib?.path) { metaRef.current = m; setMeta(m); }
    }
    // books added to collections by hand
    if (memb.length) {
      const before = JSON.stringify(nextColls);
      nextColls = nextColls.map(c => {
        let add = [...c.add];
        let remove = [...c.remove];
        for (const x of memb) {
          const want = x.names.some(n => n.toLowerCase() === c.name.toLowerCase());
          if (want && !add.includes(x.id)) { add.push(x.id); remove = remove.filter(y => y !== x.id); }
          if (!want && add.includes(x.id)) add = add.filter(y => y !== x.id);
        }
        return {...c, add, remove};
      });
      if (JSON.stringify(nextColls) !== before) changed++;
    }
    if (nextColls !== collections) changeCollections(() => nextColls);
    log('sheet read', books.length, 'rows', changed, 'changed');
    if (!quiet || changed) say(changed ? `Updated ${changed} from the sheet` : 'The sheet has no changes');
    return changed;
  }
  /** after changes: read the sheet first if it was edited on a computer, then write it fresh */
  async function syncSheet() {
    const t = Math.max(await sheetMtime(), (await csvMtime()) - 0);
    if (t && t > (app.sheetAt || 0) + 2000) {
      await importSheet(true);
      changeApp(a => ({...a, sheetAt: Date.now()})); // written again on the next round, with the new details in it
      return;
    }
    await exportSheet();
  }

  const indexReady = libs.every(l => libData[l.path] || (l.path === lib?.path && books.length));
  indexReadyRef.current = indexReady && index.length > 0;
  const xCache = useRef<{[lib: string]: {[k: string]: string | null}}>({});
  const [, setXTick] = useState(0);
  const xCover = (f: Found) => f.meta.cover || (f.lib.path === lib?.path ? covers[f.book.key] : undefined) || xCache.current[f.lib.path]?.[f.book.key] || null;
  const xPending = useRef('');
  const wantCovers = (list: Found[]) => {
    const sig = list.map(f => f.lib.path + f.book.key).join('|');
    if (!sig || sig === xPending.current) return;
    xPending.current = sig;
    setTimeout(async () => {
      let changed = false;
      for (const f of list) {
        const c = (xCache.current[f.lib.path] = xCache.current[f.lib.path] || {});
        if (f.book.key in c || f.meta.cover) continue;
        await coverFor(f.lib.path, f.book, f.meta, c);
        changed = true;
      }
      if (changed) setXTick(t => t + 1);
    }, 0);
  };
  const snapOf = (f: Found, extra?: Partial<Snap>): Snap => ({
    lib: f.lib.path, libName: f.lib.name, key: f.book.key, title: f.meta.title || f.book.fileTitle, cover: xCover(f), folder: f.book.folder, genres: f.meta.genres, at: f.book.added, ...extra,
  });
  // New tab: books found since the last refresh, plus books still missing details
  const fresh = useMemo(
    () => index.filter(f => f.isNew || needsDetails(f.meta)).sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew) || b.book.added - a.book.added),
    [index],
  );
  function goEdit(f: Found) {
    if (lib?.path === f.lib.path) setScreen({kind: 'edit', key: f.book.key, from: 'new'});
    else openLibrary(f.lib, {kind: 'edit', key: f.book.key, from: 'new'});
  }
  function goGenre(g: string) {
    const count: {[p: string]: number} = {};
    index.forEach(f => {
      if (f.meta.genres?.includes(g)) count[f.lib.path] = (count[f.lib.path] || 0) + 1;
    });
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const l = libs.find(x => x.path === best);
    if (!l) return;
    if (lib?.path === l.path) {
      setTags({[`g:${g}`]: 1});
      setCat(null);
      setFKind('g');
      setPage(1);
      setScreen({kind: 'library'});
    } else openLibrary(l, undefined, {[`g:${g}`]: 1});
  }

  // ---------- recently read, bookmarks, moving between libraries ----------
  const snap = (b: Book, extra?: Partial<Snap>): Snap => ({
    lib: lib!.path, libName: lib!.name, key: b.key, title: titleOf(b), cover: coverUri(b), folder: b.folder, genres: metaOf(b).genres, at: Date.now(), ...extra,
  });
  const same = (x: Snap, l: string, key: string) => x.lib === l && x.key === key;
  const isMarked = (b: Book) => !!lib && app.bookmarks.some(x => same(x, lib.path, b.key));
  const toggleMark = (b: Book) => {
    if (!lib) return;
    changeApp(a => ({
      ...a,
      bookmarks: isMarked(b) ? a.bookmarks.filter(x => !same(x, lib.path, b.key)) : [snap(b), ...a.bookmarks],
    }));
  };
  async function readBook(b: Book, path: string) {
    markSeen(b);
    // opening a book you haven't started marks it Reading (with today's date)
    const r = metaOf(b).reading;
    if (!r || r.state === 'plan') await updateMeta(b.key, {reading: setReading(r, 'reading')});
    if (lib) {
      const v = b.vols.find(x => x.path === path);
      const s1 = snap(b, {vol: v?.n});
      changeApp(a => ({...a, recent: [s1, ...a.recent.filter(x => !same(x, s1.lib, s1.key))].slice(0, 12)}));
    }
    await read(path);
  }
  function goBook(x: Snap, from: From) {
    const l = libs.find(y => y.path === x.lib);
    if (!l) {
      setMessage(`"${x.libName}" isn't in your libraries any more.`);
      return;
    }
    if (lib?.path === l.path) setScreen({kind: 'book', key: x.key, from});
    else openLibrary(l, {kind: 'book', key: x.key, from});
  }
  function goLibrary() {
    if (lib) return setScreen({kind: 'library'});
    const l = libs.find(y => y.path === app.lastLib) || (libs.length === 1 ? libs[0] : null);
    if (l) openLibrary(l);
    else setScreen({kind: 'libraries'});
  }
  // ---------- collections ----------
  const collections = app.collections || STARTER_COLLECTIONS;
  const [colSel, setColSel] = useState<string | null>(null); // null = the grid of collections
  const [colEdit, setColEdit] = useState(false);
  const [colDrop, setColDrop] = useState(false);
  const [helpQ, setHelpQ] = useState('');
  const changeCollections = (f: (c: Coll[]) => Coll[]) => changeApp(a => ({...a, collections: f(a.collections || STARTER_COLLECTIONS)}));
  const factsOf = (f: Found) => ({lib: f.lib, book: f.book, meta: f.meta});
  const toggleIn = (c: Coll, l: Lib, key: string, on: boolean) => {
    const id = `${l.path}|${key}`;
    changeCollections(list => list.map(x => x.id !== c.id ? x : on
      ? {...x, add: [...x.add.filter(y => y !== id), id], remove: x.remove.filter(y => y !== id)}
      : {...x, add: x.add.filter(y => y !== id), remove: [...x.remove.filter(y => y !== id), id]}));
  };

  const rememberSearch = (q: string) => {
    const t = q.trim();
    if (t) changeApp(a => ({...a, searches: [t, ...a.searches.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 6)}));
  };

  async function updateMeta(key: string, patch: Meta) {
    if (!lib) return;
    const cur = metaRef.current;
    const next: MetaStore = {...cur, books: {...cur.books, [key]: {...cur.books[key], ...patch}}};
    metaRef.current = next;
    setMeta(next);
    setLibData(d => ({...d, [lib.path]: {books, meta: next}}));
    const ok = await saveMeta(lib.path, next);
    if (!ok && !saveWarned.current) {
      saveWarned.current = true;
      setPermOpen(true); // nothing could be saved anywhere: show the permissions card once
    }
  }

  async function read(path: string) {
    log('open book', path);
    const err = await openBook(path, 'reader');
    log('open book result', err || 'ok');
    if (err) setMessage(`The reader didn't open the book.\n\n${err}`);
  }

  // load covers for whatever is on screen
  const needCovers = async (list: Book[]) => {
    if (!lib) return;
    let changed = false;
    for (const b of list) {
      if (b.key in coverCache.current && !metaOf(b).cover) continue;
      await coverFor(lib.path, b, metaOf(b), coverCache.current);
      changed = true;
    }
    if (changed) setCovers({...coverCache.current});
  };
  const coverUri = (b: Book) => metaOf(b).cover || covers[b.key] || null;
  // ask for covers after drawing, never during it
  const pendingCovers = useRef<string>('');
  const scheduleCovers = (list: Book[]) => {
    const sig = list.map(b => b.key).join('|');
    if (!sig || sig === pendingCovers.current) return;
    pendingCovers.current = sig;
    setTimeout(() => needCovers(list), 0);
  };

  // ---------- filtering and sorting (Mihon-style) ----------
  const namesOf = (field: 'genres' | 'tags') =>
    Array.from(new Set(books.flatMap(b => meta.books[b.key]?.[field] || []))).sort((a, b) => a.localeCompare(b));
  const allGenres = useMemo(() => namesOf('genres'), [books, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const allTags = useMemo(() => namesOf('tags'), [books, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const allCats = useMemo(
    () => Array.from(new Set([...shelf.flatMap(b => catsOf(b, meta.books[b.key])), ...index.flatMap(f => catsOf(f.book, f.meta))])).sort((a, b) => a.localeCompare(b)),
    [shelf, meta, index],
  );
  const readKeys = useMemo(() => {
    const m: {[k: string]: number} = {};
    app.recent.forEach((x, i) => { if (x.lib === lib?.path) m[x.key] = i + 1; });
    return m;
  }, [app.recent, lib]);
  const flagsOf = (b: Book): string[] => {
    const m = meta.books[b.key] || {};
    const f: string[] = [];
    f.push(readKeys[b.key] ? 'f:started' : 'f:unread');
    if (lib && app.bookmarks.some(x => x.lib === lib.path && x.key === b.key)) f.push('f:bookmarked');
    if (m.notes?.length) f.push('f:notes');
    if (m.fav) f.push('f:fav');
    if (m.reading?.state === 'reading' || m.reading?.state === 'rereading') f.push('f:inprogress');
    if (timesRead(m.reading) > 0) f.push('f:finished');
    if (meta.newKeys?.includes(b.key)) f.push('f:new');
    if (/(^|[^n])complete/i.test(m.status || '')) f.push('f:completed');
    if (m.translated === 'Yes') f.push('f:translated');
    if (needsDetails(m)) f.push('f:needs');
    if (b.vols.length > 1) f.push('f:series');
    if (b.missing) f.push('f:missing');
    return f;
  };
  const keysOf = (b: Book) => {
    const m = meta.books[b.key] || {};
    return [...(m.genres || []).map(g => 'g:' + g), ...(m.tags || []).map(t => 't:' + t), ...catsOf(b, m).map(c => 'c:' + c), ...flagsOf(b)];
  };
  const matches = (b: Book, ts: TagState, skip?: string) => {
    const bt = keysOf(b);
    const on = Object.keys(ts).filter(t => t !== skip);
    if (on.some(t => ts[t] === -1 && bt.includes(t))) return false;
    // flags must all hold; genres, tags and categories follow "match all / any"
    if (on.some(t => t.startsWith('f:') && ts[t] === 1 && !bt.includes(t))) return false;
    const inc = on.filter(t => ts[t] === 1 && !t.startsWith('f:'));
    if (!inc.length) return true;
    return mode === 'all' ? inc.every(t => bt.includes(t)) : inc.some(t => bt.includes(t));
  };
  const inCat = (b: Book) => !cat || catsOf(b, meta.books[b.key]).includes(cat);
  const sortKey = (b: Book, by: SortBy): string | number => {
    const m = meta.books[b.key] || {};
    if (by === 'read') return readKeys[b.key] ? 1000 - readKeys[b.key] : -1; // higher = read more recently
    if (by === 'added') return b.added;
    if (by === 'vols') return Math.max(1, b.vols.length);
    if (by === 'category') return catsOf(b, m).join(' / ').toLowerCase() || '~';
    return (m.title || b.fileTitle).replace(/^(the|a|an)\s+/i, '').toLowerCase();
  };
  const results = useMemo(() => {
    const {by, asc} = settings.sort;
    const list = shelf.filter(b => inCat(b) && matches(b, tags));
    const k = new Map(list.map(b => [b.key, sortKey(b, by)]));
    list.sort((a, b) => {
      const x = k.get(a.key)!, y = k.get(b.key)!;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, {numeric: true});
      return asc ? c : -c;
    });
    return list;
  }, [shelf, tags, mode, cat, settings.sort, meta, readKeys, app.bookmarks]); // eslint-disable-line react-hooks/exhaustive-deps
  // categories as a tree (Category › Sub-category) for the picker at the top
  const catTree = useMemo(() => {
    const parentOf: {[c: string]: string} = {};
    const kids: {[p: string]: Set<string>} = {};
    const count: {[c: string]: number} = {};
    shelf.forEach(b => {
      const cs = catsOf(b, meta.books[b.key]);
      cs.forEach((c, i) => {
        count[c] = (count[c] || 0) + 1;
        if (!(c in parentOf)) parentOf[c] = i ? cs[i - 1] : '';
        (kids[parentOf[c]] = kids[parentOf[c]] || new Set()).add(c);
      });
    });
    const out: {name: string; depth: number; count: number}[] = [];
    const seen = new Set<string>();
    const walk = (p: string, d: number) =>
      Array.from(kids[p] || []).sort((a, b) => a.localeCompare(b)).forEach(c => {
        if (seen.has(c)) return;
        seen.add(c);
        out.push({name: c, depth: d, count: count[c]});
        walk(c, d + 1);
      });
    walk('', 0);
    return out;
  }, [shelf, meta]);

  async function pickCover(): Promise<string | null> {
    if (!lib) return null;
    try {
      const dir = await screenshotDir();
      log('cover picker in', dir);
      const r: any = await FileSelector.selectFile({
        selectType: 1,
        suffixList: ['png', 'jpg', 'jpeg', 'bmp', 'webp'],
        maxNum: 1,
        title: 'Choose a cover',
        needSelectFolder: dir,
        rightButtonText: 'OK',
      });
      const list: any[] = Array.isArray(r) ? r : r?.result || [];
      log('cover picker returned', list);
      if (!list.length) return null;
      const src = String(list[0]).replace(/^file:\/\//, '');
      // keep a copy in the library, so the cover stays if the screenshot is deleted
      return (await copyImage(src, `${DEFAULT_BACKUP_DIR}/covers/own-${Date.now().toString(36)}.png`)) || src;
    } catch (e) {
      log('cover picker failed', String(e));
      setMessage("Supernote's file picker didn't open. Try again, or put the picture in the SCREENSHOT folder.");
      return null;
    }
  }

  // ===================== screens =====================
  const shell = (body: React.ReactNode) => (
    <View style={st.screen}>
      {body}
      {card}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          change={changeSettings}
          onClose={() => setShowSettings(false)}
          onLibraries={() => { setShowSettings(false); setScreen({kind: 'libraries'}); }}
          missing={settings.missing}
          onHelp={() => { setShowSettings(false); setScreen({kind: 'help'}); }}
          onPerms={async () => { setShowSettings(false); setPerm(await permStatus()); setPermOpen(true); }}
          permNote={`${Object.values(perm).filter(v => v >= 1).length} of ${PERMS.length} allowed`}
          libs={libs}
          lib={lib}
          onLib={l => { setShowSettings(false); if (l.path !== lib?.path) openLibrary(l); }}
          onClearSearches={() => changeApp(a => ({...a, searches: []}))}
          onClearHistory={() => changeApp(a => ({...a, recent: []}))}
          counts={{searches: app.searches.length, recent: app.recent.length}}
        />
      )}
      {toast && !message && !sheet && !showSettings ? (
        <Pressable style={st.toast} onPress={() => setToast(null)} accessibilityLabel="Dismiss">
          <Text style={st.toastText} numberOfLines={3}>{toast}</Text>
        </Pressable>
      ) : null}
      {permOpen ? (
        <View style={st.overlay}>
          <View style={st.dialog}>
            <Text style={[st.h2, {marginTop: 0}]}>Let InkShelf use your files</Text>
            <Text style={[st.para, {fontSize: px(18)}]}>{'Supernote asks once for each of these. Choose "Always allow" so it never asks again.'}</Text>
            {PERMS.map(p => {
              const v = perm[p.id] || 0;
              return (
                <View key={p.id} style={st.permRow}>
                  <Icon name={p.icon} size={px(30)} />
                  <View style={{flex: 1, marginLeft: px(12)}}>
                    <Text style={st.choiceTitle}>{p.label}</Text>
                    <Text style={st.small}>{p.why}</Text>
                  </View>
                  <View style={[st.permState, v >= 2 && st.btnDark]}>
                    <Text style={[st.small, {fontWeight: 'bold', color: v >= 2 ? '#ffffff' : BLACK}]}>{v >= 2 ? 'Always' : v === 1 ? 'This time' : 'Not yet'}</Text>
                  </View>
                </View>
              );
            })}
            {Object.values(perm).every(v => v >= 2) && Object.keys(perm).length ? (
              <Btn dark icon="check" label="All allowed" onPress={() => setPermOpen(false)} style={{marginTop: px(14)}} />
            ) : (
              <>
                <Btn dark icon="check" label="Allow all" onPress={allowAll} style={{marginTop: px(14)}} />
                <Btn small label="Not now" onPress={() => setPermOpen(false)} style={{marginTop: px(10)}} />
              </>
            )}
            {readOnlyLibs.size ? (
              <Text style={[st.small, {marginTop: px(12)}]}>{"Note: plugins can't write on this SD card, so InkShelf keeps your details on the Supernote itself (and in the backup). Nothing to change."}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {message ? (
        <View style={st.overlay}>
          <View style={st.dialog}>
            <Text style={st.para}>{message}</Text>
            <Btn dark label="OK" onPress={() => setMessage(null)} />
          </View>
        </View>
      ) : null}
    </View>
  );

  const taskbar = (tab: Tab) => (
    <Taskbar
      tab={tab}
      newCount={fresh.length}
      onTab={t => {
        if (t === 'home') setScreen({kind: 'home'});
        else if (t === 'library') goLibrary();
        else if (t === 'bookmarks') setScreen({kind: 'bookmarks'});
        else if (t === 'new') setScreen({kind: 'new'});
        else setShowSettings(true);
      }}
    />
  );
  const recentFound = (): {x: Snap; f?: Found}[] =>
    app.recent.map(x => {
      const f = index.find(y => y.lib.path === x.lib && y.book.key === x.key);
      return {x: f ? snapOf(f, {vol: x.vol, at: x.at}) : x, f};
    });
  const genreCards = (): {name: string; count: number; f?: Found}[] => {
    const m: {[g: string]: Found[]} = {};
    index.forEach(f => (f.meta.genres || []).forEach(g => (m[g] = m[g] || []).push(f)));
    const used = new Set<string>(); // give each genre a different book's cover where possible
    return Object.keys(m)
      .sort((a, b) => m[b].length - m[a].length || a.localeCompare(b))
      .map(g => {
        const id = (f: Found) => f.lib.path + f.book.key;
        const f = m[g].find(x => xCover(x) && !used.has(id(x))) || m[g].find(x => !used.has(id(x))) || m[g][0];
        used.add(id(f));
        return {name: g, count: m[g].length, f};
      });
  };

  // ----- book page and edit page: a card over the page you came from (tap outside to close) -----
  let card: React.ReactNode = null;
  let view: Screen = screen;
  if (!['libraries', 'book', 'edit', 'missing', 'exclude', 'browse', 'pickroot', 'coledit'].includes(screen.kind)) lastBase.current = screen;
  if (screen.kind === 'book' || screen.kind === 'edit') {
    view = {kind: screen.from || 'library'} as Screen;
    const close = () => setScreen(view);
    const b = shelf.find(x => x.key === screen.key);
    if (!b || !lib) {
      card = (
        <ModalCard onOutside={close}>
          <CardHeader title="" onBack={close} onClose={close} />
          <Text style={[st.para, st.pad]}>{lib && scanning[lib.path] && !books.length ? 'Looking for books…' : 'This book is no longer in the folder.'}</Text>
        </ModalCard>
      );
    } else {
    const splitBook = (x: Book) =>
      regroup(lib, m => {
        if (x.series === 'group') {
          const g = {...(m.groups || {})};
          delete g[x.key.replace(/^group:/, '')];
          return {...m, groups: g};
        }
        return {...m, series: {...(m.series || {}), [x.dir]: false}};
      }).then(() => { say(`Split "${titleOf(x)}" back into ${x.files.length} books`); setScreen({kind: 'library'}); });
    const backFromEdit = () => setScreen(screen.kind === 'edit' && screen.viaBook ? {kind: 'book', key: b.key, from: screen.from} : view);
    if (screen.kind === 'edit') {
      card = (
        <EditPage
          book={b}
          meta={metaOf(b)}
          allGenres={allGenres}
          allTags={allTags}
          allCats={allCats}
          cover={coverUri(b)}
          onPickCover={pickCover}
          onSplit={b.series ? () => splitBook(b) : undefined}
          onCancel={backFromEdit}
          onSave={async m => {
            await updateMeta(b.key, m);
            backFromEdit();
          }}
        />
      );
    } else {
    scheduleCovers([b]);
    const goFilter = (k: FilterKind, v: string) => {
      if (k === 'c') { setCat(v); setTags({}); }
      else { setTags({[`${k}:${v}`]: 1}); setFKind(k); }
      setPage(1);
      setScreen({kind: 'library'});
    };
    const mb = metaOf(b);
    card = (
      <ModalCard onOutside={close}>
      <BookPage
        key={b.key}
        book={b}
        meta={metaOf(b)}
        title={titleOf(b)}
        cats={catsOf(b, metaOf(b))}
        cover={coverUri(b)}
        paging={settings.paging}
        volGrid={volGrid}
        setVolGrid={setVolGrid}
        onRead={path => readBook(b, path)}
        marked={isMarked(b)}
        onNotes={notes => updateMeta(b.key, {notes})}
        onPaste={async what => {
          const m = metaOf(b);
          const text = [
            titleOf(b),
            m.genres?.length ? `Genre: ${m.genres.join(', ')}` : '',
            m.tags?.length ? `Tags: ${m.tags.join(', ')}` : '',
            [m.language && `Language: ${m.language}`, m.status && `Status: ${m.status}`].filter(Boolean).join('  ·  '),
            m.description ? `\n${m.description}` : '',
          ].filter(Boolean).join('\n');
          const copied = await copyText(text);
          if (what === 'copy') {
            setMessage(copied ? 'Copied. Paste it into a text box in any note.' : "Couldn't copy the text.");
            return;
          }
          const err = await pasteIntoNote({
            cover: what === 'details' ? null : coverUri(b),
            coverOut: await pluginFile('paste.png'),
            text: what === 'cover' ? undefined : text,
          });
          if (err) setMessage(err);
        }}
        onMark={() => toggleMark(b)}
        onEdit={() => setScreen({kind: 'edit', key: b.key, from: screen.from, viaBook: true})}
        onBack={close}
        onFilter={goFilter}
        onFav={() => updateMeta(b.key, {fav: mb.fav ? undefined : true})}
        onReading={st2 => updateMeta(b.key, {reading: setReading(mb.reading, st2)})}
        collections={collections.map(c => ({c, on: inCollection(c, {lib, book: b, meta: mb})}))}
        onCollection={(c, on) => toggleIn(c, lib, b.key, on)}
        onNewCollection={() => setScreen({kind: 'coledit', id: null})}
        reloading={!!scanning[lib.path]}
        onReload={async () => {
          // look at the folder again: new, removed or renamed volumes
          const before = b.files.length;
          const r = await scanLib(lib);
          if (!r) return say("Couldn't read the folder. Is the card in?");
          const moved = r.relinked.find(([o]) => o === b.key);
          const now = r.books.find(x => x.key === (moved ? moved[1] : b.key));
          if (moved) setScreen({kind: 'book', key: moved[1], from: screen.from});
          if (!now) return say('This book is no longer in the folder. Its details are kept as a missing link.');
          const d = now.files.length - before;
          say(moved ? 'The file was renamed: reconnected with its details.' : d > 0 ? `${d} new file${d === 1 ? '' : 's'} found` : d < 0 ? `${-d} file${d === -1 ? '' : 's'} gone` : 'Up to date: nothing changed.');
        }}
      />
      </ModalCard>
    );
    }
    }
  }


  if (screen.kind === 'libraries') {
    // Data and storage opens as a card over the page you were on; closing it goes back there
    view = lastBase.current;
    const closeData = () => setScreen(lastBase.current);
    const dataOf = (l: Lib) => (l.path === lib?.path ? {books, meta} : libData[l.path]);
    const allMissing = libs.flatMap(l => { const d = dataOf(l); return d ? missingBooks(d.meta).map(b => ({l, b, m: d.meta.books[b.key]})) : []; });
    card = (
      <ModalCard onOutside={closeData}>
        <CardHeader title="Data and storage" onBack={closeData} onClose={closeData} />
        <DataPage
          libs={libs}
          info={l => {
            const d = dataOf(l);
            const n = d?.meta.newKeys?.length || 0;
            const miss = d ? Object.keys(d.meta.missing || {}).length : 0;
            return {
              books: d ? d.books.length : null,
              line: d ? [`${d.books.length} book${d.books.length === 1 ? '' : 's'}`, n ? `${n} new` : '', miss ? `${miss} missing link${miss === 1 ? '' : 's'}` : '', readOnlyLibs.has(l.path) ? 'details kept on Supernote' : ''].filter(Boolean).join('  ·  ') : 'Not read yet',
              when: d?.meta.lastScan ? ago(d.meta.lastScan) : '',
              busy: !!scanning[l.path],
            };
          }}
          missing={settings.missing}
          setMissing={v => changeSettings({missing: v})}
          missingCount={allMissing.length}
          onOpen={l => openLibrary(l)}
          onRefresh={l => (l ? refreshAll(l) : refreshAll())}
          onRemove={async l => {
            const n = libs.filter(x => x.path !== l.path);
            setLibs(n);
            await saveLibraries(n);
            if (lib?.path === l.path) { setLib(null); setBooks([]); }
            say(`Removed ${l.name}. Your books and details are still in the folder.`);
          }}
          onAdd={addLibrary}
          onPicker={addFromBook}
          onMissing={() => setScreen({kind: 'missing'})}
          onExclude={l => setScreen({kind: 'exclude', lib: l.path, path: ''})}
          sheet={{
            when: app.sheetAt || null,
            onMake: async () => say((await exportSheet()) ? `Saved: Document › InkShelf › ${XLSX_NAME}` : "Couldn't make the sheet"),
            onRead: () => importSheet(),
            onHelp: () => setScreen({kind: 'help', topic: 'sheet'}),
          }}
          backup={{
            dir: settings.backupDir || DEFAULT_BACKUP_DIR,
            when: lastBackup,
            onNow: async () => { if (await backupNow()) say('Backed up'); else setPermOpen(true); },
            onMove: () => setScreen({kind: 'browse', path: '/storage/emulated/0/Document', for: 'backup'}),
            onRestore: async () => {
              const dir = settings.backupDir || DEFAULT_BACKUP_DIR;
              if (await readBackup(dir)) await restoreFromFolder(dir);
              else setScreen({kind: 'browse', path: null, for: 'restore'});
            },
          }}
        />
      </ModalCard>
    );
  }


  // ----- how to use InkShelf: guides you can search -----
  if (view.kind === 'help') {
    const tid = view.topic;
    const topic = HELP.find(t => t.id === tid);
    return shell(
      <>
        <Header title="How to use InkShelf" left="Back" onLeft={() => setScreen(lib ? {kind: 'library'} : {kind: 'home'})} />
        <HelpPage q={helpQ} setQ={setHelpQ} onOpen={t => setScreen({kind: 'help', topic: t.id})} />
        {topic ? (
          <ModalCard onOutside={() => setScreen({kind: 'help'})}>
            <CardHeader title="" onBack={() => setScreen({kind: 'help'})} onClose={() => setScreen({kind: 'help'})} />
            <ScrollView contentContainerStyle={{padding: px(24)}}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: px(16)}}>
                <View style={st.libIcon}><Icon name={topic.icon as IconName} size={px(32)} /></View>
                <Text style={[st.h2, {flex: 1, marginTop: 0, marginBottom: 0}]}>{topic.title}</Text>
              </View>
              {topic.steps.map((t, i) => (
                <View key={i} style={st.helpStep}>
                  <View style={st.helpNum}><Text style={st.helpNumText}>{i + 1}</Text></View>
                  <Text style={[st.para, {flex: 1, fontSize: px(19), marginBottom: 0}]}>{t}</Text>
                </View>
              ))}
              <Text style={[st.small, {marginTop: px(18)}]}>Related</Text>
              <View style={st.pillWrap}>
                {searchHelp(topic.words.split(' ').slice(0, 2).join(' ')).concat(HELP).filter((x, i, a) => x.id !== topic.id && a.indexOf(x) === i).slice(0, 3).map(x => (
                  <Pill key={x.id} label={x.title} onPress={() => setScreen({kind: 'help', topic: x.id})} />
                ))}
              </View>
            </ScrollView>
          </ModalCard>
        ) : null}
        {taskbar('home')}
      </>,
    );
  }

  // ----- home: search, recent searches, recently read, genres -----
  if (view.kind === 'home') {
    return shell(
      <>
        <Header title="" onHelp={() => setScreen({kind: 'help'})} right={<IconBtn bare name="gear" label="Data and storage" onPress={() => setScreen({kind: 'libraries'})} iconSize={px(30)} style={{marginRight: px(4)}} />} />
        <View style={st.brand} pointerEvents="none">
          <Icon name="logo" size={px(34)} />
          <Text style={st.brandText}>InkShelf</Text>
        </View>
        <Home
          libs={libs}
          index={index}
          ready={indexReady}
          recent={recentFound()}
          genres={genreCards()}
          searches={app.searches}
          paging={settings.paging}
          grid={isGrid('search')}
          setGrid={setGridFor('search')}
          cover={xCover}
          wantCovers={wantCovers}
          onSearched={rememberSearch}
          onForgetSearch={q => changeApp(a => ({...a, searches: q ? a.searches.filter(x => x !== q) : []}))}
          onOpen={x => goBook(x, 'home')}
          onFound={f => goBook(snapOf(f), 'home')}
          onGenre={goGenre}
          onViewAll={what => setScreen({kind: 'gallery', what})}
          onLibrary={l => openLibrary(l)}
          onAddLibrary={addLibrary}
        />
        {taskbar('home')}
      </>,
    );
  }

  // ----- "view all" pages for Home rows -----
  if (view.kind === 'gallery') {
    const items =
      view.what === 'recent'
        ? recentFound().map(r => ({key: r.x.lib + r.x.key, title: r.x.title, sub: r.x.vol ? `Vol ${r.x.vol}` : r.x.libName, cover: r.x.cover, f: r.f, onPress: () => goBook(r.x, 'home')}))
        : genreCards().map(g => ({key: g.name, title: g.name, sub: `${g.count} book${g.count === 1 ? '' : 's'}`, cover: g.f ? xCover(g.f) : null, f: g.f, onPress: () => goGenre(g.name)}));
    return shell(
      <>
        <Header title={view.what === 'recent' ? 'Recently read' : 'Explore by genre'} left="Home" onLeft={() => setScreen({kind: 'home'})} />
        <Gallery items={items} label={view.what === 'recent' ? `${items.length} book${items.length === 1 ? '' : 's'}` : `${items.length} genres`} paging={settings.paging} grid={isGrid('gallery')} setGrid={setGridFor('gallery')} wantCovers={wantCovers} />
        {taskbar('home')}
      </>,
    );
  }

  // ----- newly added: books still waiting for a genre/tag or a summary -----
  if (view.kind === 'new') {
    return shell(
      <>
        <Header title="Newly added" right={libs.length ? <IconBtn bare name="refresh" label="Refresh all libraries" onPress={() => refreshAll()} iconSize={px(28)} style={{marginRight: px(4)}} /> : null} />
        <NewList onAllSeen={markAllSeen} items={fresh} libs={libs} ready={indexReady} paging={settings.paging} grid={isGrid('new')} setGrid={setGridFor('new')} cover={xCover} wantCovers={wantCovers} onEdit={goEdit} onOpen={f => goBook(snapOf(f), 'new')} />
        {taskbar('new')}
      </>,
    );
  }

  // ----- collections: a grid of collections; open one to see its books -----
  if (view.kind === 'bookmarks') {
    const all = [
      {id: 'bookmarks', name: 'Bookmarks', items: app.bookmarks.map(x => ({key: x.lib + x.key, cover: x.cover || null, title: x.title}))},
      ...collections.map(c => {
        const fs = index.filter(f => inCollection(c, factsOf(f)));
        return {id: c.id, name: c.name, found: fs, items: fs.map(f => ({key: f.lib.path + f.book.key, cover: xCover(f), title: f.meta.title || f.book.fileTitle}))};
      }),
    ];
    const cur = colSel ? all.find(c => c.id === colSel) : undefined;
    const coll = cur ? collections.find(c => c.id === cur.id) : undefined;
    const back = () => { setColSel(null); setColEdit(false); setColDrop(false); };
    if (!cur) {
      wantCovers(all.flatMap(c => ((c as any).found || []).slice(0, 4)));
      return shell(
        <>
          <Header title="Collections" right={<IconBtn bare name="plus" label="New collection" onPress={() => setScreen({kind: 'coledit', id: null})} iconSize={px(28)} style={{marginRight: px(4)}} />} />
          <CollectionGrid
            items={all.map(c => ({id: c.id, name: c.name, count: c.items.length, covers: c.items.slice(0, 4).map(i => ({cover: i.cover, title: i.title})), auto: !!collections.find(x => x.id === c.id)?.rules.length}))}
            onOpen={id => { setColSel(id); setColEdit(false); }}
            onNew={() => setScreen({kind: 'coledit', id: null})}
          />
          {taskbar('bookmarks')}
        </>,
      );
    }
    const members = (cur as any).found as Found[] | undefined;
    if (members) wantCovers(members.slice(0, 12));
    return shell(
      <>
        <View style={st.header}>
          <View style={{minWidth: px(110), flexDirection: 'row'}}>
            <IconBtn bare name="back" label="All collections" onPress={back} iconSize={px(30)} />
          </View>
          <Pressable style={{flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}} onPress={() => setColDrop(!colDrop)} accessibilityLabel="Choose a collection">
            <Text style={st.headerName} numberOfLines={1}>{cur.name}</Text>
            <Icon name={colDrop ? 'up' : 'down'} size={px(24)} />
          </Pressable>
          <View style={{minWidth: px(110), flexDirection: 'row', justifyContent: 'flex-end'}}>
            <IconBtn name={colEdit ? 'check' : 'edit'} dark={colEdit} label={colEdit ? 'Done editing' : `Edit ${cur.name}`} onPress={() => setColEdit(!colEdit)} style={{marginRight: px(8)}} />
            <CloseBtn />
          </View>
        </View>
        {colEdit ? (
          <View style={st.editBar}>
            <Text style={[st.small, {flex: 1, color: BLACK}]}>{cur.id === 'bookmarks' ? 'Tap ✕ to remove a bookmark.' : 'Tap ✕ to take a book out.'}</Text>
            {coll ? <Btn small icon="filter" label="Rules and name" onPress={() => setScreen({kind: 'coledit', id: coll.id})} /> : null}
          </View>
        ) : null}
        {coll ? (
          <>
            <Toolbar text={`${cur.items.length} book${cur.items.length === 1 ? '' : 's'}${coll.rules.length ? '  ·  adds books by itself' : ''}`} grid={isGrid('collection')} setGrid={setGridFor('collection')} />
            <Collection
              key={coll.id + isGrid('collection') + colEdit}
              grid={isGrid('collection')}
              top={px(64) + (colEdit ? px(58) : 0) + px(60)}
              paging={settings.paging}
              empty={coll.rules.length ? 'No books fit this collection yet. Tap the pencil, then Rules and name, to change what it collects.' : 'Empty. Add books from a book page (the collections button), or tap the pencil to add rules.'}
              items={(members || []).map(f => ({
                key: f.lib.path + f.book.key,
                title: f.meta.title || f.book.fileTitle,
                sub: [f.meta.reading ? `${readLabel(f.meta.reading.state)} · ${day(f.meta.reading.at)}` : '', f.book.folder || f.lib.name].filter(Boolean).join('  ·  '),
                cover: xCover(f),
                pills: f.meta.genres,
                onPress: () => goBook(snapOf(f), 'bookmarks'),
                action: colEdit ? {icon: 'close' as IconName, label: `Take out of ${coll.name}`, onPress: () => toggleIn(coll, f.lib, f.book.key, false)} : undefined,
              }))}
            />
          </>
        ) : (
          <SnapList
            key={String(colEdit)}
            items={app.bookmarks}
            libs={libs}
            paging={settings.paging}
            grid={isGrid('bookmarks')}
            setGrid={setGridFor('bookmarks')}
            top={colEdit ? px(58) : 0}
            empty="No bookmarks yet. Open a book and tap Bookmark to keep it here."
            onOpen={x => goBook(x, 'bookmarks')}
            onRemove={colEdit ? x => changeApp(a => ({...a, bookmarks: a.bookmarks.filter(y => !same(y, x.lib, x.key))})) : undefined}
          />
        )}
        {taskbar('bookmarks')}
        {colDrop ? (
          <CategorySheet
            title="Collections"
            even
            allLabel="All collections"
            tree={all.map(c => ({name: c.id, label: c.name, depth: 0, count: c.items.length}))}
            total={all.length}
            current={cur.id}
            onPick={id => { setColDrop(false); setColEdit(false); setColSel(id); }}
            onClose={() => setColDrop(false)}
          />
        ) : null}
      </>,
    );
  }

  // ----- make or change a collection: hand-picked books and rules that add books by themselves -----
  if (view.kind === 'coledit') {
    const vid = view.id;
    const existing = vid ? collections.find(c => c.id === vid) : null;
    const values = (f: RuleField): string[] => {
      const uniq = (l: string[]) => Array.from(new Set(l.filter(Boolean))).sort((a, b) => a.localeCompare(b));
      if (f === 'genre') return uniq(index.flatMap(x => x.meta.genres || []));
      if (f === 'tag') return uniq(index.flatMap(x => x.meta.tags || []));
      if (f === 'category') return uniq(index.flatMap(x => catsOf(x.book, x.meta)));
      if (f === 'status') return [...READ_STATES.map(r => r.label), 'No status'];
      if (f === 'language') return uniq(index.map(x => x.meta.language || ''));
      if (f === 'fav') return ['Yes', 'No'];
      if (f === 'library') return libs.map(l => l.name);
      return [];
    };
    const cid = view.id;
    return shell(
      <>
        <CollectionEditor
          key={cid || 'new'}
          start={existing || null}
          values={values}
          count={c => index.filter(f => inCollection(c, factsOf(f))).length}
          onCancel={() => setScreen({kind: 'bookmarks'})}
          onSave={c => {
            changeCollections(list => (list.some(x => x.id === c.id) ? list.map(x => (x.id === c.id ? c : x)) : [...list, c]));
            setColSel(c.id);
            setColEdit(false);
            setScreen({kind: 'bookmarks'});
          }}
          onDelete={existing ? () => { changeCollections(list => list.filter(x => x.id !== existing.id)); setColSel(null); setScreen({kind: 'bookmarks'}); } : undefined}
        />
      </>,
    );
  }

  // ----- leave folders or files out of a library -----
  if (view.kind === 'exclude') {
    const vpath = view.path;
    const vlib = view.lib;
    const l = libs.find(x => x.path === vlib);
    if (l) {
      const setExclude = async (ex: string[]) => {
        const n = libs.map(x => (x.path === l.path ? {...x, exclude: ex} : x));
        setLibs(n);
        await saveLibraries(n);
        if (lib?.path === l.path) setLib({...l, exclude: ex});
      };
      return shell(
        <ExcludePage
          lib={l}
          path={vpath}
          onGo={p => setScreen({kind: 'exclude', lib: l.path, path: p})}
          setExclude={setExclude}
          onDone={() => { setScreen({kind: 'libraries'}); refreshAll(l); }}
        />,
      );
    }
  }

  // ----- data and storage (Mihon-style): libraries, refresh, remove, missing books -----
  // ----- books whose files are gone, but whose details are kept -----
  if (view.kind === 'missing') {
    const dataOf = (l: Lib) => (l.path === lib?.path ? {books, meta} : libData[l.path]);
    const items = libs.flatMap(l => { const d = dataOf(l); return d ? missingBooks(d.meta).map(b => ({l, b, m: d.meta.books[b.key] || {}})) : []; });
    const forget = async (list: {l: Lib; b: Book}[]) => {
      for (const l of libs) {
        const keys = list.filter(x => x.l.path === l.path).map(x => x.b.key);
        if (!keys.length) continue;
        const d = dataOf(l);
        if (!d) continue;
        const m: MetaStore = {...d.meta, books: {...d.meta.books}, missing: {...(d.meta.missing || {})}};
        keys.forEach(k => { delete m.books[k]; delete m.missing![k]; });
        await saveMeta(l.path, m, d.books);
        setLibData(x => ({...x, [l.path]: {books: d.books, meta: m}}));
        if (l.path === lib?.path) setMeta(m);
      }
    };
    return shell(
      <>
        <Header title="Missing links" left="Data and storage" onLeft={() => setScreen({kind: 'libraries'})} />
        <MissingList items={items} paging={settings.paging} onForget={x => forget([x])} onForgetAll={() => forget(items)} onOpen={x => { if (lib?.path === x.l.path) setScreen({kind: 'book', key: x.b.key, from: 'library'}); else openLibrary(x.l, {kind: 'book', key: x.b.key, from: 'library'}); }} />
      </>,
    );
  }

  // ----- folder browser -----
  if (view.kind === 'browse') {
    const purpose = view.for;
    return shell(
      <FolderBrowser
        path={view.path}
        onGo={p => setScreen({kind: 'browse', path: p, for: purpose})}
        onCancel={() => setScreen(libs.length || purpose ? {kind: 'libraries'} : {kind: 'home'})}
        title={view.for === 'backup' ? 'Where to keep the backup' : view.for === 'restore' ? 'Folder with the backup' : undefined}
        onPick={
          view.for === 'backup'
            ? p => {
                changeSettings({backupDir: p});
                say(`The backup is now kept in ${p.replace('/storage/emulated/0/', '')}`);
                setScreen({kind: 'libraries'});
              }
            : view.for === 'restore'
              ? async p => { if (await restoreFromFolder(p)) setScreen({kind: 'libraries'}); }
              : useFolder
        }
        onBookPicker={view.for ? undefined : addFromBook}
        knownRoots={knownRoots}
      />,
    );
  }

  // ----- after picking a book: which folder above it is the library? -----
  if (view.kind === 'pickroot') {
    const parts = view.file.split('/');
    const base = view.file.startsWith('/storage/emulated/0/') ? 4 : 3; // stop at the storage root
    const folders: string[] = [];
    for (let i = parts.length - 1; i >= base; i--) folders.unshift(parts.slice(0, i).join('/'));
    const rootLabel = base === 4 ? 'Supernote' : 'SD card';
    return shell(
      <>
        <Header title="Which folder is the library?" left="Cancel" onLeft={() => setScreen(libs.length ? {kind: 'libraries'} : {kind: 'home'})} />
        <View style={[st.pad, {flex: 1}]}>
          <Text style={[st.para, {fontSize: px(18)}]}>{'Tap the folder that holds all the books for this library. Its subfolders become filters.'}</Text>
          {folders.map((f, i) => (
            <Pressable key={f} onPress={() => useFolder(f)} style={[st.folderRow, {paddingLeft: px(10) + i * px(22), flexDirection: 'row', alignItems: 'center'}]}>
              <Icon name="folder-plus" size={px(26)} />
              <View style={{flex: 1, marginLeft: px(12)}}>
                <Text style={st.folderName} numberOfLines={1}>{i === 0 ? `${rootLabel}  ›  ${f.split('/').pop()}` : f.split('/').pop()}</Text>
              </View>
              <Icon name="check" size={px(24)} />
            </Pressable>
          ))}
          <Text style={[st.small, {marginTop: px(14)}]} numberOfLines={2}>{`You picked: ${parts[parts.length - 1]}`}</Text>
          <Btn small icon="library" label="Browse folders instead" onPress={() => setScreen({kind: 'browse', path: null})} style={{marginTop: px(18)}} />
        </View>
      </>,
    );
  }

  // ----- library: filter panel (Genre, Tags, More) + books or folders; category picked at the top -----
  const grid2 = grid && !settings.libFolders;
  const showFilters = settings.showFilters && !settings.libFolders;
  const sideW = showFilters ? Math.round(W * 0.34) : 0;
  const per = grid2 ? GRID_PER_PAGE : LIST_PER_PAGE;
  const pages = Math.max(1, Math.ceil(results.length / per));
  const pg = Math.min(page, pages);
  const chunk = results.slice((pg - 1) * per, pg * per);
  if (!settings.libFolders) scheduleCovers(chunk.filter(b => !b.missing));
  const resW = W - sideW;
  const avail = H - px(64) - px(58) - px(64) - TASK_H;
  const active = Object.keys(tags).length;
  const badgeOf = (b: Book) => (b.missing ? 'MISSING LINK' : undefined);
  const isNewB = (b: Book) => settings.badges.newBadge && !!meta.newKeys?.includes(b.key);
  const sortName: {[k in SortBy]: string} = {title: 'Title', read: 'Last read', added: 'Date added', vols: 'Volumes', category: 'Category'};
  const clearAll = () => { setTags({}); setPage(1); };
  const inView = shelf.filter(inCat);
  const tagCount = (k: string) => inView.filter(b => keysOf(b).includes(k) && matches(b, tags, k)).length;
  const fNames = fKind === 'g' ? allGenres : fKind === 't' ? allTags : FLAGS.filter(f => f.k !== 'f:missing' || missingHere.length || tags[f.k]).map(f => f.k);
  const fixedTop = px(10) + px(36) + px(46) + (fKind === 'f' ? px(24) : px(40) + px(24));
  const perT = Math.max(4, Math.floor((H - px(64) - fixedTop - px(64) - TASK_H - px(10)) / px(40)));
  const tPages = Math.max(1, Math.ceil(fNames.length / perT));
  const tp = Math.min(tPage, tPages);
  const tagChunk = fNames.slice((tp - 1) * perT, tp * perT);
  const cycleTag = (t: string) => {
    const n = {...tags};
    if (!n[t]) n[t] = 1;
    else if (n[t] === 1) n[t] = -1;
    else delete n[t];
    setTags(n);
    setPage(1);
  };
  const flagLabel = (k: string) => FLAGS.find(f => f.k === k)?.label || k;
  const kindOn = (k: string) => Object.keys(tags).filter(t => t.startsWith(k + ':')).length;

  let content: React.ReactNode;
  if (!shelf.length) {
    content = lib && scanning[lib.path]
      ? <Text style={[st.para, {padding: px(10)}]}>Looking for books in this folder…</Text>
      : <Text style={[st.para, {padding: px(10)}]}>No books found in this folder. InkShelf looks for EPUB, PDF, CBZ, FB2, XPS, MOBI, TXT and DOCX files (folders starting with _ or . are skipped).</Text>;
  } else if (!results.length) {
    content = (
      <View style={{padding: px(10)}}>
        <Text style={st.para}>No books match these filters.</Text>
        <Btn small icon="close" label="Clear filters" onPress={clearAll} />
      </View>
    );
  } else if (!grid2) {
    const rowH = Math.floor(avail / LIST_PER_PAGE);
    const ch = rowH - px(14);
    content = chunk.map(b => {
      const m = metaOf(b);
      const cats = catsOf(b, m);
      const sub = [
        settings.badges.vols && b.vols.length > 1 ? `${b.vols.length} vols` : '',
        settings.badges.notes && m.notes?.length ? `${m.notes.length} note${m.notes.length === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join('  ·  ');
      return (
        <Pressable key={b.key} style={[st.row, {height: rowH}]} onPress={() => setScreen({kind: 'book', key: b.key})}>
          <Cover uri={coverUri(b)} w={Math.round((ch * 2) / 3)} h={ch} title={titleOf(b)} isNew={isNewB(b)} badge={badgeOf(b)} />
          <View style={st.rowText}>
            <Text style={st.rowTitle} numberOfLines={2}>
              {titleOf(b)}
              {sub ? <Text style={st.small}>{`  · ${sub}`}</Text> : null}
            </Text>
            <View style={st.pillLine}>
              {(() => {
                // only whole pills: show what fits on one line, then "+N"
                const all = Array.from(new Set([...cats.slice(-1), ...(m.genres || [])]));
                const room = resW - Math.round((ch * 2) / 3) - px(40);
                const pw = (t: string) => t.length * px(15) * 0.56 + px(29);
                const shown: string[] = [];
                let used = 0;
                for (let i = 0; i < all.length; i++) {
                  const more = i < all.length - 1 ? px(48) : 0;
                  if (used + pw(all[i]) + more > room) break;
                  shown.push(all[i]);
                  used += pw(all[i]);
                }
                const extra = all.length - shown.length;
                return (
                  <>
                    {shown.map((t, i) => <Pill key={t + i} label={t} active={tags['g:' + t] === 1 || tags['c:' + t] === 1} />)}
                    {extra > 0 ? <Pill label={`+${extra}`} /> : null}
                  </>
                );
              })()}
            </View>
            {b.missing ? (
              <Text style={st.teaser} numberOfLines={2}>{"The file isn't in the library any more. Its details are kept and come back when the file does."}</Text>
            ) : m.description ? (
              <Text style={st.teaser} numberOfLines={titleOf(b).length > (showFilters ? 34 : 50) ? 1 : 2}>{m.description.replace(/\s+/g, ' ')}</Text>
            ) : null}
          </View>
        </Pressable>
      );
    });
  } else {
    const cols = showFilters ? 3 : 4;
    const cellH = Math.floor(avail / (GRID_PER_PAGE / cols));
    const ch = Math.min(cellH - px(52), Math.round((resW / cols - px(16)) * 1.5));
    const rows = [];
    for (let i = 0; i < chunk.length; i += cols) {
      rows.push(
        <View key={i} style={{flexDirection: 'row', height: cellH}}>
          {Array.from({length: cols}, (_, j) => {
            const b = chunk[i + j];
            return (
              <View key={j} style={st.gridCell}>
                {b && (
                  <Pressable onPress={() => setScreen({kind: 'book', key: b.key})} style={{alignItems: 'center', width: '100%'}}>
                    <Cover uri={coverUri(b)} w={Math.round((ch * 2) / 3)} h={ch} title={titleOf(b)} isNew={isNewB(b)} badge={badgeOf(b)} />
                    <Text style={st.gridTitle} numberOfLines={2}>{titleOf(b)}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>,
      );
    }
    content = rows;
  }

  return shell(
    <>
      <View style={st.header}>
        <View style={{minWidth: px(110), flexDirection: 'row'}}>
          <View>
            <IconBtn name="sidebar" label={settings.showFilters ? 'Hide filters' : 'Show filters'} dark={settings.showFilters} onPress={() => changeSettings({showFilters: !settings.showFilters, libFolders: false})} size={px(46)} style={{borderRadius: px(12)}} />
            {!showFilters && active ? <View style={st.badge}><Text style={st.badgeText}>{active}</Text></View> : null}
          </View>
        </View>
        <Pressable style={{flex: 1, alignItems: 'center', justifyContent: 'center'}} onPress={() => setCatOpen(true)} accessibilityLabel="Choose a category">
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={st.headerName} numberOfLines={1}>{cat || 'All'}</Text>
            <Icon name="down" size={px(24)} />
          </View>
          {libs.length > 1 && lib ? <Text style={[st.small, {marginTop: -px(2)}]} numberOfLines={1}>{lib.name}</Text> : null}
        </Pressable>
        <View style={{minWidth: px(110), flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center'}}>
          <IconBtn bare name="help" label="How to use InkShelf" onPress={() => setScreen({kind: 'help'})} iconSize={px(30)} />
          <IconBtn bare name="gear" label="Data and storage" onPress={() => setScreen({kind: 'libraries'})} iconSize={px(30)} style={{marginRight: px(4)}} />
          <CloseBtn />
        </View>
      </View>
      <View style={{flex: 1, flexDirection: 'row'}}>
        {showFilters && (
          <View style={[st.side, {width: sideW}]}>
            <View style={{flex: 1, padding: px(10)}}>
              <View style={st.sideHead}>
                <Text style={st.sideTitle}>Filters</Text>
                {active > 0 && (
                  <Pressable onPress={clearAll} hitSlop={px(8)}>
                    <Text style={st.clear}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <View style={st.kindTabs}>
                {(['g', 't', 'f'] as const).map(k => (
                  <Pressable key={k} onPress={() => { setFKind(k); setTPage(1); }} style={[st.kindTab, fKind === k && st.btnDark]} accessibilityLabel={k === 'g' ? 'Genre' : k === 't' ? 'Tags' : 'More filters'}>
                    <Text style={[st.kindTabText, fKind === k && {color: '#ffffff'}]} numberOfLines={1}>{(k === 'g' ? 'Genre' : k === 't' ? 'Tags' : 'More') + (kindOn(k) && fKind !== k ? ' •' : '')}</Text>
                  </Pressable>
                ))}
              </View>
              {fNames.length === 0 ? (
                <Text style={st.hint}>{`No ${fKind === 'g' ? 'genres' : 'tags'} yet. Open a book and tap Edit to add some.`}</Text>
              ) : (
                <>
                  {fKind !== 'f' ? (
                    <View style={st.modeRow}>
                      <Text style={st.small}>Match </Text>
                      <Pill label="All" active={mode === 'all'} onPress={() => { setMode('all'); setPage(1); }} />
                      <Pill label="Any" active={mode === 'any'} onPress={() => { setMode('any'); setPage(1); }} />
                    </View>
                  ) : null}
                  <Text style={st.hint}>Tap once to include, again to exclude.</Text>
                  <View style={{flex: 1}}>
                    {tagChunk.map(t => {
                      const k = fKind === 'f' ? t : `${fKind}:${t}`;
                      return <FilterRow key={k} label={fKind === 'f' ? flagLabel(t) : t} count={tagCount(k)} state={tags[k] || 0} onPress={() => cycleTag(k)} />;
                    })}
                  </View>
                  <View style={st.gPager}>
                    <IconBtn name="back" label="Previous" disabled={tp <= 1} onPress={() => setTPage(tp - 1)} />
                    <Text style={st.small}>{`${tp} / ${tPages}`}</Text>
                    <IconBtn name="forward" label="Next" disabled={tp >= tPages} onPress={() => setTPage(tp + 1)} />
                  </View>
                </>
              )}
            </View>
          </View>
        )}
        <View style={{flex: 1}}>
      <View style={st.resBar}>
        <Pressable onPress={() => setSheet('sort')} style={{flex: 1}} accessibilityLabel="Sort">
          <Text style={st.resCount} numberOfLines={1}>
            {settings.libFolders ? 'Folders' : `${results.length} book${results.length === 1 ? '' : 's'}`}
            <Text style={st.small}>{settings.libFolders ? '' : `  ·  ${sortName[settings.sort.by]} ${settings.sort.asc ? '↑' : '↓'}`}</Text>
          </Text>
        </Pressable>
        {active && !showFilters ? <Pill small label="Clear  ✕" onPress={clearAll} /> : null}
        <View style={{flexDirection: 'row'}}>
          <ViewIcon kind="list" on={!grid && !settings.libFolders} onPress={() => { changeSettings({libraryGrid: false, libFolders: false}); setPage(Math.floor(((pg - 1) * per) / LIST_PER_PAGE) + 1); }} />
          <ViewIcon kind="grid" on={grid && !settings.libFolders} onPress={() => { changeSettings({libraryGrid: true, libFolders: false}); setPage(Math.floor(((pg - 1) * per) / GRID_PER_PAGE) + 1); }} />
          <IconBtn name="folder" label="Folder view" dark={settings.libFolders} onPress={() => changeSettings({libFolders: !settings.libFolders})} size={px(44)} style={{marginLeft: px(8), borderRadius: px(10)}} />
        </View>
      </View>
      {settings.libFolders && lib ? (
        <FolderView
          key={lib.path}
          books={books}
          libName={lib.name}
          title={titleOf}
          cover={coverUri}
          wantCovers={scheduleCovers}
          avail={avail}
          onOpen={b => setScreen({kind: 'book', key: b.key})}
          onMakeSeries={d => regroup(lib, m => ({...m, series: {...(m.series || {}), [d]: true}})).then(() => say(`"${d.split('/').pop()}" is now one book`))}
          onSplit={b => regroup(lib, m => {
            if (b.series === 'group') { const g = {...(m.groups || {})}; delete g[b.key.replace(/^group:/, '')]; return {...m, groups: g}; }
            return {...m, series: {...(m.series || {}), [b.dir]: false}};
          }).then(() => say(`Split "${titleOf(b)}" into ${b.files.length} books`))}
          onCombine={(list, t) => regroup(lib, m => {
            const rel = (f: string) => f.slice(lib.path.length + 1);
            const id = Date.now().toString(36);
            return {...m, groups: {...(m.groups || {}), [id]: {title: t, files: list.flatMap(x => x.files.map(rel))}}};
          }).then(() => say(`Combined ${list.length} books into "${t}"`))}
        />
      ) : (
        <>
          <View style={{flex: 1, paddingHorizontal: px(10)}}>{content}</View>
          <View style={st.pager}>
            <IconBtn name="back" label="Previous page" disabled={pg <= 1} onPress={() => setPage(pg - 1)} />
            <Text style={st.pageText}>{`${pg} / ${pages}`}</Text>
            <IconBtn name="forward" label="Next page" disabled={pg >= pages} onPress={() => setPage(pg + 1)} />
          </View>
        </>
      )}
        </View>
      </View>
      {taskbar('library')}
      {catOpen ? (
        <CategorySheet
          tree={catTree}
          total={shelf.length}
          current={cat}
          onPick={c => { setCat(c); setPage(1); setCatOpen(false); }}
          libs={libs}
          lib={lib}
          onLib={l => { setCatOpen(false); if (l.path !== lib?.path) openLibrary(l); }}
          onClose={() => setCatOpen(false)}
        />
      ) : null}
      {sheet ? (
        <LibrarySheet
          only={['sort', 'display']}
          tab={sheet === 'display' ? 'display' : 'sort'}
          setTab={setSheet}
          onClose={() => setSheet(null)}
          tags={tags}
          setTags={t => { setTags(t); setPage(1); }}
          mode={mode}
          setMode={setMode}
          count={k => shelf.filter(b => keysOf(b).includes(k) && matches(b, tags, k)).length}
          hasMissing={missingHere.length > 0}
          cats={allCats}
          genres={allGenres}
          tagNames={allTags}
          settings={settings}
          change={changeSettings}
          shown={results.length}
        />
      ) : null}
    </>,
  );
}

/** "volumes", "chapters", "parts"… from how the files are named */
const partsWord = (vols: Vol[]) => {
  const k = Array.from(new Set(vols.map(v => v.kind || 'Vol')));
  if (k.length !== 1) return 'parts';
  return ({Vol: 'volumes', Part: 'parts', Ch: 'chapters', Ep: 'episodes', Book: 'books', Lesson: 'lessons', Module: 'modules', Unit: 'units', Arc: 'arcs', Season: 'seasons'} as {[k: string]: string})[k[0]] || 'parts';
};
const day = (t: number) => new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
const dayTime = (t: number) => new Date(t).toLocaleString(undefined, {day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'});
/** a small mark for each reading status (shapes, since the screen has no colours) */
function StatusDot({state, light}: {state?: ReadState; light?: boolean}) {
  const c = light ? '#ffffff' : BLACK;
  const base = {width: px(16), height: px(16), borderRadius: px(8), borderWidth: 2, borderColor: c, marginRight: px(8)};
  if (!state) return <View style={[base, {borderStyle: 'dashed'}]} />;
  if (state === 'completed') return <View style={[base, {backgroundColor: c}]} />;
  if (state === 'reading' || state === 'rereading')
    return <View style={[base, {overflow: 'hidden'}]}><View style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: px(6), backgroundColor: c}} />{state === 'rereading' ? <View style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: px(3), backgroundColor: c}} /> : null}</View>;
  if (state === 'hold') return <View style={[base, {borderRadius: px(3)}]} />;
  if (state === 'dropped') return <View style={[base, {alignItems: 'center', justifyContent: 'center'}]}><View style={{width: px(14), height: 2, backgroundColor: c, transform: [{rotate: '45deg'}]}} /></View>;
  return <View style={base} />;
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

// ---------- book page: two columns, paged with arrows (or scrolling) ----------
type Item = {h: number; brk?: boolean; group?: string; text?: string; endPara?: boolean; node?: React.ReactNode; sec?: string; vol?: boolean};

/** greedy word wrap by character count (a cautious guess of what fits) */
function wrapWords(text: string, perLine: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > perLine) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}
const pillW = (t: string) => t.length * px(14) * 0.55 + px(25); // small pill incl. margin
function pillLines(list: string[], width: number): string[][] {
  // first fit: a short pill can slot into a gap on an earlier line
  const lines: {pills: string[]; used: number}[] = [];
  for (const t of list) {
    const w = pillW(t);
    const line = lines.find(l => l.used + w <= width);
    if (line) {
      line.pills.push(t);
      line.used += w;
    } else lines.push({pills: [t], used: w});
  }
  return lines.map(l => l.pills);
}
function pack(items: Item[], cap: number): Item[][] {
  const pages: Item[][] = [[]];
  let used = 0;
  for (const it of items) {
    const cur = pages[pages.length - 1];
    if (cur.length && (it.brk || used + it.h > cap)) {
      pages.push([]);
      used = 0;
    }
    if (it.brk && !it.node) continue;
    if (!pages[pages.length - 1].length && !it.node && !it.text) continue; // no spacer at the top of a page
    pages[pages.length - 1].push(it);
    used += it.h;
  }
  return pages;
}
function renderItems(items: Item[]) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.group) {
      const lines = [it.text];
      let last = it.endPara;
      while (i + 1 < items.length && items[i + 1].group === it.group) {
        i++;
        lines.push(items[i].text);
        last = items[i].endPara;
      }
      out.push(<Text key={i} style={[st.bodyText, last && {marginBottom: px(10)}]}>{lines.join(' ')}</Text>);
    } else if (it.node) out.push(<View key={i} style={{height: it.h, overflow: 'hidden'}}>{it.node}</View>);
    else out.push(<View key={i} style={{height: it.h}} />);
  }
  return out;
}
function Arrows({page, pages, onPage, name}: {page: number; pages: number; onPage: (p: number) => void; name?: string}) {
  return (
    <View style={st.gPager}>
      <IconBtn name="back" label="Previous" disabled={page <= 0} onPress={() => onPage(page - 1)} />
      <View style={{alignItems: 'center', flex: 1}}>
        {name ? <Text style={st.pagerName} numberOfLines={1}>{name}</Text> : null}
        <Text style={st.small}>{`${page + 1} / ${pages}`}</Text>
      </View>
      <IconBtn name="forward" label="Next" disabled={page >= pages - 1} onPress={() => onPage(page + 1)} />
    </View>
  );
}

function BookPage(props: {
  book: Book;
  meta: Meta;
  title: string;
  cats: string[];
  cover: string | null;
  paging: Settings['paging'];
  volGrid: boolean;
  setVolGrid: (g: boolean) => void;
  onRead: (path: string) => void;
  onEdit: () => void;
  onBack: () => void;
  onFilter: (k: FilterKind, v: string) => void;
  marked: boolean;
  onMark: () => void;
  onNotes: (notes: Note[]) => void;
  onPaste: (what: 'cover' | 'details' | 'both' | 'copy') => void;
  onFav: () => void;
  onReading: (s: ReadState | null) => void;
  collections: {c: Coll; on: boolean}[];
  onCollection: (c: Coll, on: boolean) => void;
  onNewCollection: () => void;
  onReload: () => void;
  reloading: boolean;
}) {
  const {book: b, meta: m, title, cats, cover, paging, volGrid, setVolGrid, onRead, onEdit, onBack, onFilter, marked, onMark, onNotes, onPaste, onFav, onReading, collections, onCollection, onNewCollection, onReload, reloading} = props;
  const [statusOpen, setStatusOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [lp, setLp] = useState(0);
  const [rp, setRp] = useState(0);
  const scroll = paging === 'scroll';

  const LW = Math.round(CARD_W * 0.37);
  const RW = CARD_W - LW;
  const lIn = LW - px(28);
  const rIn = RW - px(32);
  const statusW = px(190);
  const titleLines = Math.min(2, wrapWords(title, Math.floor((CARD_W - px(32) - statusW) / (px(26) * 0.56))).length);
  const titleH = px(14) + titleLines * px(34) + px(10);
  const colH = CARD_H - px(64) - titleH;
  const pagerH = px(56);

  // ----- left: cover, then Genre, Language, Status (arrows turn to Tags, then Details), then the button -----
  const coverW = Math.min(lIn, px(190));
  const coverH = Math.round(coverW * 1.5);
  const startH = px(48) + px(10);
  const left: Item[] = [];
  let sec = 'Overview';
  const label = (t: string) => ({h: px(32), sec, node: <Text style={st.infoLabel}>{t}</Text>});
  const pills = (list: string[], k: FilterKind) =>
    pillLines(list, lIn).map(line => ({
      h: px(33),
      sec,
      node: <View style={{flexDirection: 'row'}}>{line.map(t => <Pill small key={t} label={t} onPress={() => onFilter(k, t)} />)}</View>,
    }));
  const field = (name: string, value: string | undefined, onPress?: () => void) => {
    const v = value || 'Not set';
    const lines = Math.min(3, wrapWords(v, Math.floor(lIn / (px(17) * 0.56))).length);
    left.push(label(name));
    left.push({
      h: lines * px(24) + px(8),
      sec,
      node: (
        <Text onPress={onPress} style={[st.infoValue, !value && {color: '#777777'}, onPress && {textDecorationLine: 'underline'}]} numberOfLines={3}>
          {v}
        </Text>
      ),
    });
  };
  left.push(label('Genre'));
  if (m.genres?.length) left.push(...pills(m.genres, 'g'));
  else left.push({h: px(28), sec, node: <Text style={st.small}>None yet</Text>});
  left.push({h: px(6), sec});
  field('Language', m.language);
  field('Status', m.status);
  sec = 'Tags';
  left.push({h: 0, brk: true});
  left.push(label('Tags'));
  if (m.tags?.length) left.push(...pills(m.tags, 't'));
  else left.push({h: px(28), sec, node: <Text style={st.small}>None yet</Text>});
  sec = 'Details';
  left.push({h: 0, brk: true});
  left.push(label('Category'));
  if (cats.length) left.push(...pills(cats, 'c'));
  else left.push({h: px(28), sec, node: <Text style={st.small}>None</Text>});
  left.push({h: px(6), sec});
  field('Completely translated', m.translated);
  if (m.reading) {
    const n = timesRead(m.reading);
    const done = [...m.reading.history].reverse().find(h => h.state === 'completed');
    field('Reading', `${readLabel(m.reading.state)} since ${day(m.reading.at)}` + (done && m.reading.state !== 'completed' ? `. Finished ${day(done.at)}` : '') + (n > 1 ? `. Read ${n} times` : ''));
  }
  if (b.vols.length > 1) field('Files', `${b.vols.length} parts${b.series === 'group' ? ' (combined by you)' : b.series ? ' (one folder)' : ''}`);

  // ----- right: description, then volumes -----
  const right: Item[] = [];
  const perLine = Math.floor(rIn / (px(18) * 0.53));
  if (b.missing) {
    right.push({h: px(96), node: (
      <View style={st.missingNote}>
        <Text style={[st.small, {color: BLACK, fontWeight: 'bold'}]}>{"Missing link: the file isn't in the library."}</Text>
        <Text style={st.small} numberOfLines={2}>{'Details are kept and reconnect by themselves when the file is back.'}</Text>
      </View>
    )});
  }
  right.push({h: px(40), node: <Text style={st.colHead}>Description</Text>});
  const paras = (m.description || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (!paras.length) right.push({h: px(36), node: <Text style={st.small}>No description yet. Tap Edit to add one.</Text>});
  paras.forEach((p, pi) => {
    const lines = wrapWords(p, perLine);
    lines.forEach((ln, li) => right.push({h: px(27) + (li === lines.length - 1 ? px(10) : 0), group: 'p' + pi, text: ln, endPara: li === lines.length - 1}));
  });
  if (b.vols.length) {
    right.push({h: px(10)});
    right.push({
      h: px(56),
      node: (
        <View style={st.volHead}>
          <Text style={st.colHead}>{`${b.vols.length} ${partsWord(b.vols)}`}</Text>
          <View style={{flexDirection: 'row'}}>
            <ViewIcon kind="list" on={!volGrid} onPress={() => setVolGrid(false)} />
            <ViewIcon kind="grid" on={volGrid} onPress={() => setVolGrid(true)} />
          </View>
        </View>
      ),
    });
    const vlabel = (v: Vol) => v.label.replace(/^\(|\)$/g, '');
    if (!volGrid) {
      b.vols.forEach(v =>
        right.push({
          h: px(50),
          vol: true,
          node: (
            <Pressable style={st.volRow} onPress={() => onRead(v.path)} accessibilityLabel={`Open ${v.kind || 'Vol'} ${v.n}`}>
              <Icon name="play" size={px(22)} />
              <Text style={[st.volRowText, {marginLeft: px(8)}]}>{`${v.kind || 'Vol'} ${v.n}`}</Text>
              <Text style={st.volName} numberOfLines={1}>{vlabel(v)}</Text>
            </Pressable>
          ),
        }),
      );
    } else {
      const per = 4;
      const cw = Math.floor((rIn - (per - 1) * px(8)) / per);
      for (let i = 0; i < b.vols.length; i += per) {
        right.push({
          h: px(84),
          vol: true,
          node: (
            <View style={{flexDirection: 'row'}}>
              {b.vols.slice(i, i + per).map((v, j) => (
                <Pressable key={v.path} style={[st.volCell, {width: cw, marginLeft: j ? px(8) : 0}]} onPress={() => onRead(v.path)}>
                  <Text style={st.volCellText}>{`${v.kind || 'Vol'} ${v.n}`}</Text>
                  {vlabel(v) ? <Text style={st.volCellSub} numberOfLines={2}>{vlabel(v)}</Text> : null}
                </Pressable>
              ))}
            </View>
          ),
        });
      }
    }
  }

  const lPages = scroll ? [left] : pack(left, colH - coverH - px(28) - startH - pagerH - px(4));
  const rPages = scroll ? [right] : pack(right, colH - pagerH - px(20) - px(36)); // room for a "continued" line
  rPages.forEach((pg, i) => {
    if (i > 0 && pg[0]?.vol) pg.unshift({h: px(36), node: <Text style={[st.colHead, {fontSize: px(18)}]}>Volumes, continued</Text>});
  });
  const lName = (i: number) => {
    const n = lPages[i][0]?.sec || '';
    return n === 'Tags' && i > 0 && lPages[i - 1][0]?.sec === 'Tags' ? 'More tags' : n;
  };
  const lpg = Math.min(lp, lPages.length - 1);
  const rpg = Math.min(rp, rPages.length - 1);

  const top = (
    <View style={{width: coverW + px(14), height: coverH + px(10)}}>
      <Pressable onLongPress={() => setPasteOpen(true)} delayLongPress={450} accessibilityLabel="Hold to paste into your note">
        <Cover uri={cover} w={coverW} h={coverH} title={title} />
      </Pressable>
      <PostIt notes={m.notes || []} onPress={() => setNotesOpen(true)} style={{position: 'absolute', right: 0, bottom: 0}} />
    </View>
  );
  const start = b.missing ? (
    <View style={[st.startBtn, {width: lIn, backgroundColor: '#ffffff', borderWidth: 2, borderStyle: 'dashed', borderColor: BLACK}]}>
      <Icon name="unlink" size={px(24)} />
      <Text style={[st.startText, {marginLeft: px(8), color: BLACK, fontSize: px(16)}]}>Missing link</Text>
    </View>
  ) : (
    <Pressable style={[st.startBtn, {width: lIn}]} onPress={() => onRead(b.files[0])}>
      <Icon name="play-on" size={px(26)} color="#ffffff" />
      {b.vols.length ? <Text style={[st.startText, {marginLeft: px(8)}]}>{`${b.vols[0].kind || 'Vol'} ${b.vols[0].n}`}</Text> : null}
    </Pressable>
  );
  return (
    <>
      <View style={st.header}>
        <IconBtn bare name="back" label="Back" onPress={onBack} iconSize={px(30)} />
        <View style={{flex: 1}} />
        <IconBtn name="refresh" label="Check this book's files again" dark={reloading} disabled={reloading} onPress={onReload} style={{marginRight: px(10)}} />
        <IconBtn name={m.fav ? 'heart-on' : 'heart'} label={m.fav ? 'Remove from favourites' : 'Favourite'} dark={!!m.fav} onPress={onFav} style={{marginRight: px(10)}} />
        <IconBtn name="collections" label="Collections" onPress={() => setColOpen(true)} style={{marginRight: px(10)}} />
        <IconBtn name="paste" label="Paste into note" onPress={() => setPasteOpen(true)} style={{marginRight: px(10)}} />
        <IconBtn name={marked ? 'bookmark-on' : 'bookmark'} label={marked ? 'Remove bookmark' : 'Bookmark'} onPress={onMark} style={{marginRight: px(10)}} />
        <IconBtn name="edit" label="Edit details" onPress={onEdit} style={{marginRight: px(6)}} />
        <IconBtn bare name="close" label="Close page" onPress={onBack} iconSize={px(30)} />
      </View>
      <View style={{height: titleH, paddingHorizontal: px(16), flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#888888'}}>
        <Text style={[st.bookTitle, {flex: 1}]} numberOfLines={2}>{title}</Text>
        <Pressable onPress={() => setStatusOpen(true)} style={[st.statusChip, {maxWidth: statusW}, m.reading && st.btnDark]} accessibilityLabel="Reading status">
          <StatusDot state={m.reading?.state} light={!!m.reading} />
          <Text style={[st.statusText, m.reading && {color: '#ffffff'}]} numberOfLines={1}>{readLabel(m.reading?.state)}</Text>
          <Icon name="down" size={px(20)} color={m.reading ? '#ffffff' : BLACK} />
        </Pressable>
      </View>
      <View style={{flex: 1, flexDirection: 'row'}}>
        <View style={[st.bookLeft, {width: LW}]}>
          {scroll ? (
            <ScrollView contentContainerStyle={{padding: px(14)}}>
              {top}
              <View style={{height: px(14)}} />
              {renderItems(left)}
              {start}
            </ScrollView>
          ) : (
            <>
              <View style={{flex: 1, paddingHorizontal: px(14), paddingTop: px(14), overflow: 'hidden'}}>
                {top}
                <View style={{height: px(14)}} />
                {renderItems(lPages[lpg])}
              </View>
              <View style={{paddingHorizontal: px(14), paddingBottom: px(10)}}>{start}</View>
              <View style={{paddingHorizontal: px(10)}}>
                <Arrows page={lpg} pages={lPages.length} onPage={setLp} name={lName(lpg)} />
              </View>
            </>
          )}
        </View>
        <View style={{flex: 1}}>
          {scroll ? (
            <ScrollView contentContainerStyle={{padding: px(16)}}>{renderItems(right)}</ScrollView>
          ) : (
            <>
              <View style={{flex: 1, paddingHorizontal: px(16), paddingTop: px(12), overflow: 'hidden'}}>{renderItems(rPages[rpg])}</View>
              <View style={{paddingHorizontal: px(12)}}>
                <Arrows page={rpg} pages={rPages.length} onPage={setRp} />
              </View>
            </>
          )}
        </View>
      </View>
      {statusOpen ? (
        <View style={st.sheetWrap}>
          <Pressable style={{flex: 1}} onPress={() => setStatusOpen(false)} accessibilityLabel="Close" />
          <View style={st.sheet}>
            <Pressable onPress={() => setStatusOpen(false)} hitSlop={px(12)} style={{alignItems: 'center'}}>
              <View style={st.handle} />
              <Text style={st.sheetTitle}>Reading status</Text>
            </Pressable>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', marginTop: px(10)}}>
              {READ_STATES.map(r => {
                const on = m.reading?.state === r.id;
                return (
                  <Pressable key={r.id} onPress={() => { onReading(on ? null : r.id); setStatusOpen(false); }} style={[st.statusPick, on && st.btnDark]} accessibilityLabel={r.label}>
                    <StatusDot state={r.id} light={on} />
                    <Text style={[st.statusText, {fontSize: px(19)}, on && {color: '#ffffff'}]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {m.reading ? <Btn small icon="close" label="Clear status" onPress={() => { onReading(null); setStatusOpen(false); }} style={{marginTop: px(6)}} /> : null}
            <Text style={[st.section, {marginTop: px(14)}]}>History</Text>
            {(m.reading?.history || []).length ? (
              [...(m.reading?.history || [])].reverse().slice(0, 6).map((h, i) => (
                <View key={i} style={st.histRow}>
                  <StatusDot state={h.state} />
                  <Text style={[st.statusText, {flex: 1}]}>{readLabel(h.state)}</Text>
                  <Text style={st.small}>{dayTime(h.at)}</Text>
                </View>
              ))
            ) : (
              <Text style={st.small}>{'No changes yet. Opening a book marks it Reading; set Completed when you finish, and the date is kept.'}</Text>
            )}
          </View>
        </View>
      ) : null}
      {colOpen ? (
        <View style={st.sheetWrap}>
          <Pressable style={{flex: 1}} onPress={() => setColOpen(false)} accessibilityLabel="Close" />
          <View style={st.sheet}>
            <Pressable onPress={() => setColOpen(false)} hitSlop={px(12)} style={{alignItems: 'center'}}>
              <View style={st.handle} />
              <Text style={st.sheetTitle}>Collections</Text>
            </Pressable>
            <Text style={[st.hint, {marginTop: px(8)}]}>Ticked by hand, or automatically when the book fits a collection's rules.</Text>
            {collections.map(({c, on}) => (
              <TriRow key={c.id} label={c.name} state={on ? 1 : 0} onPress={() => onCollection(c, !on)} />
            ))}
            <Btn small icon="plus" label="New collection" onPress={() => { setColOpen(false); onNewCollection(); }} style={{marginTop: px(12)}} />
          </View>
        </View>
      ) : null}
      {notesOpen ? <NotesBoard title={title} notes={m.notes || []} onChange={onNotes} onClose={() => setNotesOpen(false)} /> : null}
      {pasteOpen ? <PasteSheet cover={cover} title={title} onPick={w => { setPasteOpen(false); onPaste(w); }} onClose={() => setPasteOpen(false)} /> : null}
    </>
  );
}

// ---------- paste a book into the note InkShelf was opened from ----------
function PasteSheet({cover, title, onPick, onClose}: {cover: string | null; title: string; onPick: (w: 'cover' | 'details' | 'both' | 'copy') => void; onClose: () => void}) {
  const opt = (w: 'cover' | 'details' | 'both' | 'copy', icon: IconName, label: string, dark?: boolean) => (
    <Pressable onPress={() => onPick(w)} style={{flex: 1, alignItems: 'center'}} accessibilityLabel={label}>
      <View style={[st.round, dark && st.btnDark]}><Icon name={icon} size={px(30)} color={dark ? '#ffffff' : BLACK} /></View>
      <Text style={st.tileLabel}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={st.sheetWrap}>
      <Pressable style={{flex: 1}} onPress={onClose} accessibilityLabel="Close" />
      <View style={st.sheet}>
        <Pressable onPress={onClose} hitSlop={px(12)} style={{alignItems: 'center'}}>
          <View style={st.handle} />
          <Text style={st.sheetTitle}>Paste into your note</Text>
        </Pressable>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: px(16), marginBottom: px(18)}}>
          <Cover uri={cover} w={px(60)} h={px(90)} title={title} />
          <Text style={[st.rowTitle, {flex: 1, marginLeft: px(14)}]} numberOfLines={2}>{title}</Text>
        </View>
        <View style={{flexDirection: 'row'}}>
          {opt('both', 'paste', 'Cover + details', true)}
          {opt('cover', 'image', 'Cover')}
          {opt('details', 'text', 'Details')}
          {opt('copy', 'copy', 'Copy text')}
        </View>
      </View>
    </View>
  );
}

// ---------- post-it notes on a book ----------
const NOTE_COLORS: {id: NoteColor; label: string; bg: string}[] = [
  {id: 'lemon', label: 'Lemon', bg: '#fbf0a0'},
  {id: 'rose', label: 'Rose', bg: '#f8cdd6'},
  {id: 'sky', label: 'Sky', bg: '#cde2f6'},
  {id: 'mint', label: 'Mint', bg: '#cfeed6'},
  {id: 'paper', label: 'Paper', bg: '#f2f2f2'},
];
const noteBg = (c: NoteColor) => (NOTE_COLORS.find(x => x.id === c) || NOTE_COLORS[0]).bg;

/** the little sticky note on the cover's bottom-right corner */
function PostIt({notes, onPress, style}: {notes: Note[]; onPress: () => void; style?: any}) {
  const n = notes.length;
  const sz = px(52);
  return (
    <Pressable onPress={onPress} hitSlop={px(6)} accessibilityLabel={n ? `${n} notes` : 'Add a note'} style={style}>
      <View style={[st.postit, {width: sz, height: sz, backgroundColor: n ? noteBg(notes[0].color) : '#fbf0a0'}]}>
        <View style={st.postitFold} />
        {n ? (
          <>
            <Text style={st.postitNum}>{n}</Text>
            <Text style={st.postitLabel}>{n === 1 ? 'note' : 'notes'}</Text>
          </>
        ) : (
          <>
            <Text style={st.postitNum}>+</Text>
            <Text style={st.postitLabel}>note</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function NotesSheet({title, notes, onChange, onClose}: {title: string; notes: Note[]; onChange: (n: Note[]) => void; onClose: () => void}) {
  const [sel, setSel] = useState(0);
  const [editing, setEditing] = useState<Note | null>(null);
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null); // deleting asks for a second tap
  const cur = notes[Math.min(sel, notes.length - 1)];
  const startNew = () => {
    setConfirm(null);
    setEditing({id: Date.now().toString(36), text: '', color: NOTE_COLORS[notes.length % NOTE_COLORS.length].id, at: Date.now()});
  };
  const save = () => {
    if (!editing) return;
    const n = {...editing, title: editing.title?.trim() || undefined, text: editing.text.trim(), at: Date.now()};
    if (!n.text && !n.title) return setEditing(null);
    const i = notes.findIndex(x => x.id === n.id);
    const next = i >= 0 ? notes.map(x => (x.id === n.id ? n : x)) : [...notes, n];
    onChange(next);
    setSel(i >= 0 ? i : next.length - 1);
    setEditing(null);
  };
  const removeOne = (id: string) => {
    if (confirm !== 'one') return setConfirm('one');
    const i = notes.findIndex(x => x.id === id);
    onChange(notes.filter(x => x.id !== id));
    setSel(Math.max(0, i - 1));
    setEditing(null);
    setConfirm(null);
  };
  const removeAll = () => {
    if (confirm !== 'all') return setConfirm('all');
    onChange([]);
    setSel(0);
    setEditing(null);
    setConfirm(null);
  };
  const isSaved = (n: Note | null) => !!n && notes.some(x => x.id === n.id);
  const boxW = W - px(60) - px(36);
  const boxH = Math.round(H * 0.46);
  const warn = confirm ? <Text style={[st.small, {textAlign: 'center', marginTop: px(8)}]}>{confirm === 'all' ? 'Tap the bin again to delete all notes on this book.' : 'Tap the bin again to delete this note.'}</Text> : null;
  return (
    <View style={st.modalWrap}>
      <Pressable style={StyleSheet.absoluteFill} onPress={editing ? undefined : onClose} />
      <View style={st.modal}>
        <View style={st.modalHead}>
          <Icon name="note" size={px(30)} />
          <View style={{flex: 1, marginLeft: px(10)}}>
            <Text style={st.small} numberOfLines={1}>{title}</Text>
            <Text style={st.cardSub}>{`${notes.length} / ${MAX_NOTES}`}</Text>
          </View>
          {notes.length > 1 && !editing ? (
            <IconBtn name="trash-all" label="Delete all notes" dark={confirm === 'all'} onPress={removeAll} style={{marginRight: px(8)}} />
          ) : null}
          <IconBtn bare name="close" label="Close notes" onPress={onClose} iconSize={px(28)} />
        </View>

        {/* one tab per note, plus "+" while there is room */}
        <View style={{flexDirection: 'row', marginBottom: px(14)}}>
          {notes.map((x, i) => (
            <Pressable key={x.id} onPress={() => { setSel(i); setEditing(null); setConfirm(null); }} style={[st.noteTab, {backgroundColor: noteBg(x.color)}, i === sel && !editing && st.noteTabOn, editing?.id === x.id && st.noteTabOn]}>
              <Text style={st.noteTabText} numberOfLines={1}>{x.title || `${i + 1}`}</Text>
            </Pressable>
          ))}
          {notes.length < MAX_NOTES ? (
            <Pressable onPress={startNew} style={[st.noteTab, st.noteTabPlus, editing && !isSaved(editing) && st.noteTabOn]} accessibilityLabel="New note">
              <Icon name="plus" size={px(24)} />
            </Pressable>
          ) : null}
        </View>

        {editing ? (
          <>
            <View style={[st.noteBig, {width: boxW, height: boxH, backgroundColor: noteBg(editing.color)}]}>
              <TextInput style={st.noteTitleInput} value={editing.title || ''} onChangeText={t => setEditing({...editing, title: t})} placeholder="Title (optional)" placeholderTextColor="#666666" maxLength={40} />
              <TextInput
                style={st.noteTextInput}
                value={editing.text}
                onChangeText={t => setEditing({...editing, text: t})}
                placeholder="Your thoughts, a favourite line, where you stopped…"
                placeholderTextColor="#666666"
                multiline
                maxLength={500}
              />
              <Text style={[st.small, {textAlign: 'right'}]}>{`${editing.text.length} / 500`}</Text>
            </View>
            <View style={{flexDirection: 'row', marginTop: px(14), alignItems: 'center'}}>
              {NOTE_COLORS.map(c => (
                <Pressable key={c.id} onPress={() => setEditing({...editing, color: c.id})} style={{marginRight: px(12)}} accessibilityLabel={c.label}>
                  <View style={[st.swatch, {backgroundColor: c.bg}, editing.color === c.id && {borderWidth: 3.5}]}>
                    {editing.color === c.id ? <Icon name="check" size={px(22)} /> : null}
                  </View>
                </Pressable>
              ))}
              <View style={{flex: 1}} />
              {isSaved(editing) ? <IconBtn name="trash" label="Delete note" dark={confirm === 'one'} onPress={() => removeOne(editing.id)} style={{marginRight: px(10)}} /> : null}
              <IconBtn name="close" label="Cancel" onPress={() => { setEditing(null); setConfirm(null); }} style={{marginRight: px(10)}} />
              <IconBtn name="check" label="Save note" dark onPress={save} />
            </View>
            {warn}
          </>
        ) : cur ? (
          <>
            <View style={[st.noteBig, {width: boxW, height: boxH, backgroundColor: noteBg(cur.color)}]}>
              {cur.title ? <Text style={st.noteTitle} numberOfLines={1}>{cur.title}</Text> : null}
              <Text style={st.noteText} numberOfLines={cur.title ? 12 : 13}>{cur.text}</Text>
              <Text style={[st.small, {position: 'absolute', right: px(16), bottom: px(12)}]}>{dateText(cur.at)}</Text>
            </View>
            <View style={{flexDirection: 'row', marginTop: px(14), justifyContent: 'flex-end'}}>
              <IconBtn name="trash" label="Delete note" dark={confirm === 'one'} onPress={() => removeOne(cur.id)} style={{marginRight: px(10)}} />
              <IconBtn name="edit" label="Edit note" dark onPress={() => { setEditing(cur); setConfirm(null); }} />
            </View>
            {warn}
          </>
        ) : (
          <Pressable onPress={startNew} style={[st.noteBig, {width: boxW, height: boxH, backgroundColor: '#fbf0a0', justifyContent: 'center', alignItems: 'center'}]} accessibilityLabel="Write a note">
            <View style={[st.round, {backgroundColor: BLACK}]}><Icon name="plus" size={px(32)} color="#ffffff" /></View>
            <Text style={[st.small, {textAlign: 'center', marginTop: px(12)}]}>{'Up to five notes:\nthoughts, quotes, where you stopped.'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}


// ---------- notes board: every note pinned up, a little crooked, like real sticky notes ----------
const tilt = (id: string, i: number) => {
  let h = 7 + i;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) % 997;
  return ((h % 9) - 4) * 0.9; // -3.6° … 3.6°, the same every time for a note
};
function NotesBoard({title, notes, onChange, onClose}: {title: string; notes: Note[]; onChange: (n: Note[]) => void; onClose: () => void}) {
  const [editing, setEditing] = useState<Note | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const startNew = () => setEditing({id: Date.now().toString(36), text: '', color: NOTE_COLORS[notes.length % NOTE_COLORS.length].id, at: Date.now()});
  const save = () => {
    if (!editing) return;
    const n = {...editing, title: editing.title?.trim() || undefined, text: editing.text.trim(), at: Date.now()};
    if (!n.text && !n.title) return setEditing(null);
    onChange(notes.some(x => x.id === n.id) ? notes.map(x => (x.id === n.id ? n : x)) : [...notes, n]);
    setEditing(null);
  };
  const boardW = CARD_W - px(36);
  const boardH = CARD_H - px(64) - px(96);
  const cols = 2;
  const slots = Math.min(MAX_NOTES, notes.length + (notes.length < MAX_NOTES && !picking ? 1 : 0));
  const rows = Math.max(2, Math.ceil(slots / cols));
  const nw = Math.floor(boardW / cols) - px(28);
  const nh = Math.floor(boardH / rows) - px(26);
  const lines = Math.max(2, Math.floor((nh - px(60)) / px(25)));
  return (
    <View style={[StyleSheet.absoluteFill, {backgroundColor: '#ffffff'}]}>
      <View style={st.header}>
        <IconBtn bare name="back" label="Back to the book" onPress={onClose} iconSize={px(30)} />
        <View style={{flex: 1, marginLeft: px(6)}}>
          <Text style={st.headerName} numberOfLines={1}>Notes</Text>
          <Text style={st.small} numberOfLines={1}>{`${title}  ·  ${notes.length} / ${MAX_NOTES}`}</Text>
        </View>
        {!picking && notes.length ? <IconBtn name="trash" label="Choose notes to delete" onPress={() => { setPicking(true); setPicked([]); }} style={{marginRight: px(8)}} /> : null}
        <IconBtn bare name="close" label="Close notes" onPress={onClose} iconSize={px(30)} />
      </View>
      <View style={[st.board, {width: boardW, height: boardH}]}>
        {Array.from({length: rows}).map((_, r) => (
          <View key={r} style={{flexDirection: 'row', flex: 1}}>
            {Array.from({length: cols}).map((__, c) => {
              const i = r * cols + c;
              const n = notes[i];
              if (!n) {
                if (i === notes.length && notes.length < MAX_NOTES && !picking) {
                  return (
                    <View key={c} style={st.boardSlot}>
                      <Pressable onPress={startNew} style={[st.stickyNew, {width: nw, height: nh}]} accessibilityLabel="New note">
                        <Icon name="plus" size={px(34)} />
                        <Text style={[st.small, {marginTop: px(6)}]}>New note</Text>
                      </Pressable>
                    </View>
                  );
                }
                return <View key={c} style={st.boardSlot} />;
              }
              const sel = picked.includes(n.id);
              return (
                <View key={c} style={st.boardSlot}>
                  <Pressable
                    onPress={() => (picking ? setPicked(sel ? picked.filter(x => x !== n.id) : [...picked, n.id]) : setEditing(n))}
                    style={[st.sticky, {width: nw, height: nh, backgroundColor: noteBg(n.color), transform: [{rotate: `${tilt(n.id, i)}deg`}]}, sel && {borderWidth: 3.5, borderColor: BLACK}]}
                    accessibilityLabel={picking ? `${sel ? 'Unselect' : 'Select'} note ${i + 1}` : `Note ${i + 1}: ${n.title || n.text.slice(0, 30)}`}>
                    <View style={st.pin} />
                    {n.title ? <Text style={st.stickyTitle} numberOfLines={1}>{n.title}</Text> : null}
                    <Text style={st.stickyText} numberOfLines={n.title ? lines - 1 : lines}>{n.text}</Text>
                    <Text style={st.stickyDate}>{dateText(n.at)}</Text>
                    {picking ? (
                      <View style={[st.pickMark, sel && st.btnDark]}>{sel ? <Icon name="check" size={px(22)} color="#ffffff" /> : null}</View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={st.boardBar}>
        {picking ? (
          <>
            <Text style={[st.small, {position: 'absolute', left: px(20)}]}>{picked.length ? `${picked.length} to delete` : 'Tap the notes to delete'}</Text>
            <IconBtn name="close" label="Cancel deleting" onPress={() => { setPicking(false); setPicked([]); }} size={px(56)} style={{marginRight: px(16)}} />
            <IconBtn
              dark
              name="check"
              label="Delete the chosen notes"
              disabled={!picked.length}
              onPress={() => { onChange(notes.filter(x => !picked.includes(x.id))); setPicking(false); setPicked([]); }}
              size={px(56)}
            />
          </>
        ) : (
          <Text style={st.small}>{notes.length ? 'Tap a note to read or change it.' : 'Pin up to five notes: thoughts, quotes, where you stopped.'}</Text>
        )}
      </View>
      {editing ? (
        <View style={st.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={save} accessibilityLabel="Save and close" />
          <View style={[st.sticky, {width: CARD_W - px(80), height: Math.round(CARD_H * 0.62), backgroundColor: noteBg(editing.color), padding: px(22)}]}>
            <TextInput style={st.noteTitleInput} value={editing.title || ''} onChangeText={t => setEditing({...editing, title: t})} placeholder="Title (optional)" placeholderTextColor="#666666" maxLength={40} />
            <TextInput
              style={st.noteTextInput}
              value={editing.text}
              onChangeText={t => setEditing({...editing, text: t})}
              placeholder="Your thoughts, a favourite line, where you stopped…"
              placeholderTextColor="#666666"
              multiline
              maxLength={500}
            />
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: px(10)}}>
              {NOTE_COLORS.map(c => (
                <Pressable key={c.id} onPress={() => setEditing({...editing, color: c.id})} style={{marginRight: px(10)}} accessibilityLabel={c.label}>
                  <View style={[st.swatch, {backgroundColor: c.bg}, editing.color === c.id && {borderWidth: 3.5}]}>{editing.color === c.id ? <Icon name="check" size={px(20)} /> : null}</View>
                </Pressable>
              ))}
              <View style={{flex: 1}} />
              <Text style={[st.small, {marginRight: px(10)}]}>{`${editing.text.length} / 500`}</Text>
              <IconBtn name="close" label="Cancel" onPress={() => setEditing(null)} style={{marginRight: px(8)}} />
              <IconBtn dark name="check" label="Save note" onPress={save} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------- taskbar ----------



type Tab = 'library' | 'new' | 'home' | 'bookmarks' | 'settings';
function Taskbar({tab, onTab, newCount}: {tab: Tab; onTab: (t: Tab) => void; newCount: number}) {
  const items: {t: Tab; icon: IconName; label: string}[] = [
    {t: 'library', icon: 'library', label: 'Library'},
    {t: 'new', icon: 'new', label: 'Newly added'},
    {t: 'home', icon: 'home', label: 'Home'},
    {t: 'bookmarks', icon: 'collections', label: 'Collections'},
    {t: 'settings', icon: 'settings', label: 'Settings'},
  ];
  const short: {[t in Tab]: string} = {library: 'Library', new: 'New', home: 'Home', bookmarks: 'Collections', settings: 'Settings'};
  return (
    <View style={st.taskbar}>
      {items.map(({t, icon, label}) => {
        const on = t === tab;
        const badge =
          t === 'new' && newCount > 0 ? (
            <View style={[st.badge, {top: on ? px(2) : -px(4), right: on ? px(2) : -px(10)}]}>
              <Text style={st.badgeText}>{newCount > 99 ? '99+' : newCount}</Text>
            </View>
          ) : null;
        return (
          <Pressable key={t} onPress={() => onTab(t)} style={st.task} accessibilityRole="button" accessibilityLabel={label}>
            {on ? (
              <>
                {/* the open tab sits in a dip cut into the bar, like a call-to-action button */}
                <View style={st.notchClip}>
                  <View style={st.notch} />
                </View>
                <View style={st.taskCta}>
                  <Icon name={icon} size={px(32)} />
                  {badge}
                </View>
                <Text style={[st.taskLabel, st.taskLabelOn]} numberOfLines={1}>{short[t]}</Text>
              </>
            ) : (
              <>
                <View style={{marginTop: px(12)}}>
                  <Icon name={icon} size={px(28)} color="#555555" />
                  {badge}
                </View>
                <Text style={st.taskLabel} numberOfLines={1}>{short[t]}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- settings: a sheet that slides over the page ----------
function Seg({options}: {options: {label: React.ReactNode; on: boolean; onPress: () => void}[]}) {
  return (
    <View style={st.seg}>
      {options.map((o, i) => (
        <Pressable key={i} onPress={o.onPress} style={[st.segItem, o.on && st.segOn]}>
          {typeof o.label === 'string' ? <Text style={[st.segText, o.on && {fontWeight: 'bold'}]}>{o.label}</Text> : o.label}
        </Pressable>
      ))}
    </View>
  );
}
function Tile({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <View style={{flex: 1, alignItems: 'center', marginHorizontal: px(6)}}>
      <View style={st.tile}>{children}</View>
      <Text style={st.tileLabel}>{label}</Text>
    </View>
  );
}
function RoundBtn({label, note, onPress, children, dim}: {label: string; note?: string; onPress: () => void; children: React.ReactNode; dim?: boolean}) {
  return (
    <Pressable onPress={onPress} disabled={dim} style={[{flex: 1, alignItems: 'center'}, dim && st.dim]}>
      <View style={st.round}>{children}</View>
      <Text style={st.tileLabel}>{label}</Text>
      {note ? <Text style={[st.tileLabel, {marginTop: 0}]}>{note}</Text> : null}
    </Pressable>
  );
}
function MiniIcon({kind, on}: {kind: 'list' | 'grid'; on: boolean}) {
  return <View style={{opacity: on ? 1 : 0.5}}><Icon name={kind} size={px(28)} /></View>;
}
function SettingsSheet({settings, change, onClose, onLibraries, onClearSearches, onClearHistory, counts, onHelp, onPerms, permNote, libs, lib, onLib}: {
  libs: Lib[];
  lib: Lib | null;
  onLib: (l: Lib) => void;
  missing?: Settings['missing'];
  onHelp: () => void;
  onPerms: () => void;
  permNote: string;
  settings: Settings;
  change: (p: Partial<Settings>) => void;
  onClose: () => void;
  onLibraries: () => void;
  onClearSearches: () => void;
  onClearHistory: () => void;
  counts: {searches: number; recent: number};
}) {
  const view = (key: 'libraryGrid' | 'volumeGrid') => (
    <Seg
      options={[
        {label: <MiniIcon kind="list" on={!settings[key]} />, on: !settings[key], onPress: () => change({[key]: false})},
        {label: <MiniIcon kind="grid" on={settings[key]} />, on: settings[key], onPress: () => change({[key]: true})},
      ]}
    />
  );
  return (
    <ModalCard onOutside={onClose}>
      <CardHeader title="Settings" onBack={onClose} onClose={onClose} />
      <View style={[st.pad, {flex: 1}]}>
        {libs.length > 1 ? (
          <>
            <Text style={st.section}>Library</Text>
            <View style={st.pillWrap}>
              {libs.map(l => <Pill key={l.path} label={l.name} active={l.path === lib?.path} onPress={() => onLib(l)} />)}
            </View>
          </>
        ) : null}
        <View style={{flexDirection: 'row', marginTop: px(16)}}>
          <View style={{flex: 2, alignItems: 'center', marginHorizontal: px(6)}}>
            <Seg
              options={[
                {label: <Icon name="pages" size={px(30)} />, on: settings.paging === 'arrows', onPress: () => change({paging: 'arrows'})},
                {label: <Icon name="scroll" size={px(30)} />, on: settings.paging === 'scroll', onPress: () => change({paging: 'scroll'})},
              ]}
            />
            <Text style={st.tileLabel}>Turn pages  ·  or scroll</Text>
          </View>
        </View>

        <View style={{flexDirection: 'row', marginTop: px(18)}}>
          <Tile label="Library view">{view('libraryGrid')}</Tile>
          <Tile label="Volumes view">{view('volumeGrid')}</Tile>
        </View>

        <View style={{flexDirection: 'row', marginTop: px(18)}}>
          <RoundBtn label="Data and storage" onPress={onLibraries}>
            <Icon name="database" size={px(30)} />
          </RoundBtn>
          <RoundBtn label="Clear searches" note={`${counts.searches} saved`} onPress={onClearSearches} dim={!counts.searches}>
            <Icon name="search" size={px(30)} />
          </RoundBtn>
          <RoundBtn label="Clear history" note={`${counts.recent} recent`} onPress={onClearHistory} dim={!counts.recent}>
            <Icon name="clock" size={px(30)} />
          </RoundBtn>
        </View>
        <View style={{flexDirection: 'row', marginTop: px(14)}}>
          <RoundBtn label="How to use" onPress={onHelp}>
            <Icon name="help" size={px(30)} />
          </RoundBtn>
          <RoundBtn label="Permissions" note={permNote} onPress={onPerms}>
            <Icon name="save" size={px(30)} />
          </RoundBtn>
          <View style={{flex: 1}} />
        </View>

        <View style={{flex: 1}} />
        <Btn dark icon="check" a11y="Done" onPress={onClose} style={{marginTop: px(20)}} />
      </View>
    </ModalCard>
  );
}


// ---------- library sheet: Filter, Category, Tags, Sort, Display (like Mihon) ----------
type SheetTab = 'filter' | 'category' | 'tags' | 'sort' | 'display';
const SORT_WORDS: {[k in SortBy]: [string, string]} = {
  title: ['A → Z', 'Z → A'],
  read: ['Not read first', 'Read most recently first'],
  added: ['Oldest first', 'Newest first'],
  vols: ['Fewest first', 'Most first'],
  category: ['A → Z', 'Z → A'],
};
const FLAGS: {k: string; label: string}[] = [
  {k: 'f:unread', label: 'Not read yet'},
  {k: 'f:started', label: 'Started'},
  {k: 'f:bookmarked', label: 'Bookmarked'},
  {k: 'f:new', label: 'New'},
  {k: 'f:fav', label: 'Favourite'},
  {k: 'f:inprogress', label: 'In progress'},
  {k: 'f:finished', label: 'Finished by me'},
  {k: 'f:notes', label: 'Has notes'},
  {k: 'f:completed', label: 'Completed'},
  {k: 'f:translated', label: 'Completely translated'},
  {k: 'f:series', label: 'Several volumes'},
  {k: 'f:needs', label: 'Needs details'},
  {k: 'f:missing', label: 'Missing link'},
];
function TriRow({label, count, state, onPress}: {label: string; count?: number; state: 0 | 1 | -1; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={st.triRow} hitSlop={px(2)} accessibilityLabel={label}>
      <View style={[st.triBox, state === 1 && st.btnDark, state === -1 && {borderStyle: 'dashed'}]}>
        {state === 1 ? <Icon name="check" size={px(22)} color="#ffffff" /> : state === -1 ? <Icon name="close" size={px(20)} /> : null}
      </View>
      <Text style={[st.triLabel, state === -1 && {textDecorationLine: 'line-through'}, count === 0 && state === 0 && {color: '#999999'}]} numberOfLines={1}>{label}</Text>
      {count !== undefined ? <Text style={st.fCount}>{count}</Text> : null}
    </Pressable>
  );
}
function LibrarySheet(props: {
  only?: SheetTab[];
  tab: SheetTab;
  setTab: (t: SheetTab) => void;
  onClose: () => void;
  tags: TagState;
  setTags: (t: TagState) => void;
  mode: 'all' | 'any';
  setMode: (m: 'all' | 'any') => void;
  count: (k: string) => number;
  hasMissing: boolean;
  cats: string[];
  genres: string[];
  tagNames: string[];
  settings: Settings;
  change: (p: Partial<Settings>) => void;
  shown: number;
}) {
  const {only, tab, setTab, onClose, tags, setTags, mode, setMode, count, hasMissing, cats, genres, tagNames, settings, change, shown} = props;
  const [kind, setKind] = useState<'g' | 't'>('g');
  const [pg, setPg] = useState(0);
  useEffect(() => setPg(0), [tab, kind]);
  const cycle = (k: string) => {
    const n = {...tags};
    if (!n[k]) n[k] = 1;
    else if (n[k] === 1) n[k] = -1;
    else delete n[k];
    setTags(n);
  };
  const clearOf = (prefix: string[]) => {
    const n = {...tags};
    Object.keys(n).forEach(k => prefix.some(p => k.startsWith(p)) && delete n[k]);
    setTags(n);
  };
  const ROWS = 9;
  const paged = (rows: React.ReactNode[], empty: string) => {
    const pages = Math.max(1, Math.ceil(rows.length / ROWS));
    const p = Math.min(pg, pages - 1);
    return (
      <>
        <View style={{height: ROWS * px(50)}}>{rows.length ? rows.slice(p * ROWS, (p + 1) * ROWS) : <Text style={[st.small, {marginTop: px(10)}]}>{empty}</Text>}</View>
        {pages > 1 ? <Arrows page={p} pages={pages} onPage={setPg} /> : <View style={{height: px(46)}} />}
      </>
    );
  };
  const matchRow = (
    <View style={[st.modeRow, {justifyContent: 'space-between'}]}>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <Text style={st.small}>Match </Text>
        <Pill small label="All" active={mode === 'all'} onPress={() => setMode('all')} />
        <Pill small label="Any" active={mode === 'any'} onPress={() => setMode('any')} />
      </View>
      <Text style={st.hint}>Tap: include  ·  again: exclude</Text>
    </View>
  );
  const allTabs: {t: SheetTab; label: string}[] = [
    {t: 'filter', label: 'Filter'},
    {t: 'category', label: 'Category'},
    {t: 'tags', label: 'Tags'},
    {t: 'sort', label: 'Sort'},
    {t: 'display', label: 'Display'},
  ];
  const tabs = allTabs.filter(x => !only || only.includes(x.t));
  const on = (prefix: string) => Object.keys(tags).filter(k => k.startsWith(prefix)).length;
  let body: React.ReactNode = null;
  if (tab === 'filter') {
    body = paged(
      FLAGS.filter(f => f.k !== 'f:missing' || hasMissing || tags[f.k]).map(f => <TriRow key={f.k} label={f.label} count={count(f.k)} state={tags[f.k] || 0} onPress={() => cycle(f.k)} />),
      '',
    );
  } else if (tab === 'category') {
    body = (
      <>
        {matchRow}
        {paged(cats.map(c => <TriRow key={c} label={c} count={count('c:' + c)} state={tags['c:' + c] || 0} onPress={() => cycle('c:' + c)} />), 'No categories yet. They come from your folder names, or add them in a book\'s Edit page.')}
      </>
    );
  } else if (tab === 'tags') {
    const names = kind === 'g' ? genres : tagNames;
    body = (
      <>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <View style={[st.kindTabs, {flex: 1, marginTop: 0}]}>
            {(['g', 't'] as const).map(k => (
              <Pressable key={k} onPress={() => setKind(k)} style={[st.kindTab, kind === k && st.btnDark]}>
                <Text style={[st.kindTabText, kind === k && {color: '#ffffff'}]}>{k === 'g' ? `Genre${on('g:') ? ` (${on('g:')})` : ''}` : `Tags${on('t:') ? ` (${on('t:')})` : ''}`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {matchRow}
        {paged(names.map(n => <TriRow key={n} label={n} count={count(`${kind}:${n}`)} state={tags[`${kind}:${n}`] || 0} onPress={() => cycle(`${kind}:${n}`)} />), `No ${kind === 'g' ? 'genres' : 'tags'} yet. Open a book and tap Edit to add some.`)}
      </>
    );
  } else if (tab === 'sort') {
    const opts: {by: SortBy; label: string}[] = [
      {by: 'title', label: 'Title'},
      {by: 'read', label: 'Last read'},
      {by: 'added', label: 'Date added'},
      {by: 'vols', label: 'Number of volumes'},
      {by: 'category', label: 'Category'},
    ];
    body = (
      <View style={{height: ROWS * px(50) + px(46)}}>
        {opts.map(o => {
          const cur = settings.sort.by === o.by;
          return (
            <Pressable key={o.by} style={st.triRow} onPress={() => change({sort: {by: o.by, asc: cur ? !settings.sort.asc : o.by === 'title' || o.by === 'category'}})} accessibilityLabel={`Sort by ${o.label}`}>
              <View style={[st.triBox, {borderWidth: 0}]}>{cur ? <Icon name={settings.sort.asc ? 'up' : 'down'} size={px(24)} /> : null}</View>
              <Text style={[st.triLabel, cur && {fontWeight: 'bold'}]}>{o.label}</Text>
              {cur ? <Text style={st.fCount}>{SORT_WORDS[o.by][settings.sort.asc ? 0 : 1]}</Text> : null}
            </Pressable>
          );
        })}
        <Text style={[st.hint, {marginTop: px(10)}]}>Tap the chosen one again to reverse it.</Text>
      </View>
    );
  } else {
    const b = settings.badges;
    const view = settings.libFolders ? 'folders' : settings.libraryGrid ? 'grid' : 'list';
    body = (
      <View style={{height: ROWS * px(50) + px(46)}}>
        <Text style={st.section}>Layout</Text>
        <Seg
          options={[
            {label: <MiniIcon kind="list" on={view === 'list'} />, on: view === 'list', onPress: () => change({libraryGrid: false, libFolders: false})},
            {label: <MiniIcon kind="grid" on={view === 'grid'} />, on: view === 'grid', onPress: () => change({libraryGrid: true, libFolders: false})},
            {label: <View style={{opacity: view === 'folders' ? 1 : 0.5}}><Icon name="folder" size={px(28)} /></View>, on: view === 'folders', onPress: () => change({libFolders: true})},
          ]}
        />
        <Text style={st.tileLabel}>List  ·  Covers  ·  Folders (combine books into series)</Text>
        <Text style={[st.section, {marginTop: px(16)}]}>Show on books</Text>
        <TriRow label="NEW label" state={b.newBadge ? 1 : 0} onPress={() => change({badges: {...b, newBadge: !b.newBadge}})} />
        <TriRow label="Number of volumes" state={b.vols ? 1 : 0} onPress={() => change({badges: {...b, vols: !b.vols}})} />
        <TriRow label="Number of notes" state={b.notes ? 1 : 0} onPress={() => change({badges: {...b, notes: !b.notes}})} />
      </View>
    );
  }
  const cleared = tab === 'filter' ? on('f:') : tab === 'category' ? on('c:') : tab === 'tags' ? on('g:') + on('t:') : 0;
  return (
    <View style={st.sheetWrap}>
      <Pressable style={{flex: 1}} onPress={onClose} accessibilityLabel="Close" />
      <View style={st.sheet}>
        <Pressable onPress={onClose} hitSlop={px(12)} style={{alignItems: 'center'}}>
          <View style={st.handle} />
        </Pressable>
        <View style={st.sheetTabs}>
          {tabs.map(x => {
            const n = x.t === 'filter' ? on('f:') : x.t === 'category' ? on('c:') : x.t === 'tags' ? on('g:') + on('t:') : 0;
            return (
              <Pressable key={x.t} onPress={() => setTab(x.t)} style={[st.sheetTab, tab === x.t && st.sheetTabOn]} accessibilityLabel={x.label}>
                <Text style={[st.sheetTabText, tab === x.t && {fontWeight: 'bold'}]}>{x.label + (n ? ` ${n}` : '')}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{marginTop: px(10)}}>{body}</View>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: px(8)}}>
          {cleared ? <Btn small icon="close" label="Clear" onPress={() => clearOf(tab === 'filter' ? ['f:'] : tab === 'category' ? ['c:'] : ['g:', 't:'])} style={{marginRight: px(10)}} /> : null}
          <Btn dark icon="check" label={`Show ${shown} book${shown === 1 ? '' : 's'}`} onPress={onClose} style={{flex: 1}} />
        </View>
      </View>
    </View>
  );
}


// ---------- the category picker at the top of the library ----------
function CategorySheet({tree, total, current, onPick, onClose, title = 'Category', allLabel = 'All', even}: {
  even?: boolean; // split into two equal columns (a flat list)
  title?: string;
  allLabel?: string;
  tree: {name: string; depth: number; count: number; label?: string}[];
  total: number;
  current: string | null;
  onPick: (c: string | null) => void;
  libs?: Lib[];
  lib?: Lib | null;
  onLib?: (l: Lib) => void;
  onClose: () => void;
}) {
  const rows: {name: string | null; depth: number; count: number; label?: string}[] = [{name: null, depth: 0, count: total}, ...tree];
  // a category and its sub-categories stay together; a second column only when one is full
  const perCol = even ? Math.min(9, Math.max(1, Math.ceil((tree.length + 1) / 2))) : 9;
  const blocks: (typeof rows)[] = [];
  rows.forEach(r => (r.depth === 0 || !blocks.length ? blocks.push([r]) : blocks[blocks.length - 1].push(r)));
  const columns: (typeof rows)[] = [[]];
  for (const bl of blocks) {
    let cur = columns[columns.length - 1];
    if (cur.length && cur.length + bl.length > perCol) columns.push((cur = []));
    for (const r of bl) {
      if (cur.length >= perCol) columns.push((cur = []));
      cur.push(r);
    }
  }
  const pages = Math.max(1, Math.ceil(columns.length / 2));
  const start = Math.max(0, Math.floor(columns.findIndex(c => c.some(r => r.name === current)) / 2));
  const [pg, setPg] = useState(start);
  const p = Math.min(pg, pages - 1);
  const left = columns[p * 2] || [];
  const right = columns[p * 2 + 1] || [];
  const col = (list: typeof rows) => (
    <View style={{flex: 1}}>
      {list.map(r => {
        const on = r.name === current;
        return (
          <Pressable key={r.name || '*'} onPress={() => onPick(r.name)} style={[st.catRow, {paddingLeft: px(10) + r.depth * px(18)}, on && st.btnDark]} accessibilityLabel={r.label || r.name || allLabel}>
            {r.depth ? <Text style={[st.small, {marginRight: px(4)}, on && {color: '#ffffff'}]}>└</Text> : null}
            <Text style={[st.catName, {fontSize: px(18)}, r.depth > 0 && {fontWeight: 'normal'}, on && {color: '#ffffff'}]} numberOfLines={1}>{r.label || r.name || allLabel}</Text>
            <Text style={[st.fCount, on && {color: '#ffffff'}]}>{r.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  // drops down from the title; everything else is dimmed, tap there to close
  return (
    <View style={st.dropWrap}>
      <View style={st.drop}>
        <View style={{flexDirection: 'row', height: Math.max(left.length, right.length) * px(52)}}>
          {col(left)}
          <View style={{width: px(10)}} />
          {right.length ? col(right) : <View style={{flex: 1}} />}
        </View>
        {pages > 1 ? <Arrows page={p} pages={pages} onPage={setPg} /> : null}
      </View>
      <Pressable style={{flex: 1}} onPress={onClose} accessibilityLabel={`Close ${title.toLowerCase()} list`} />
    </View>
  );
}

// ---------- collection editor ----------
function CollectionEditor({start, values, count, onSave, onCancel, onDelete}: {
  start: Coll | null;
  values: (f: RuleField) => string[];
  count: (c: Coll) => number;
  onSave: (c: Coll) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [c, setC] = useState<Coll>(start || {id: Date.now().toString(36), name: '', rules: [], match: 'all', add: [], remove: []});
  const [pick, setPick] = useState<{title: string; options: string[]; onPick: (v: string) => void; typed?: boolean; row: number; current?: string} | null>(null);
  const rowsY = useRef(0);
  const rowY = useRef<{[i: number]: number}>({});
  const [typed, setTyped] = useState('');
  const [sure, setSure] = useState(false);
  const setRule = (i: number, r: Partial<Rule>) => setC({...c, rules: c.rules.map((x, j) => (j === i ? {...x, ...r} : x))});
  const fieldName = (f: RuleField) => RULE_FIELDS.find(x => x.id === f)?.label || f;
  const n = count(c);
  const openField = (i: number) => setPick({row: i, title: 'Look at', current: fieldName(c.rules[i].field), options: RULE_FIELDS.map(x => x.label), onPick: v => setRule(i, {field: RULE_FIELDS.find(x => x.label === v)!.id, value: ''})});
  const openValue = (i: number) => {
    const r = c.rules[i];
    setPick(r.field === 'title'
      ? {row: i, title: 'Words in the title', options: [], typed: true, onPick: v => setRule(i, {value: v})}
      : {row: i, title: fieldName(r.field), current: r.value, options: values(r.field), typed: r.field !== 'status' && r.field !== 'fav' && r.field !== 'library', onPick: v => setRule(i, {value: v})});
  };
  const ruleRow = (r: Rule, i: number, open?: 'field' | 'value') => (
    <View style={st.ruleRow}>
      <Pressable style={[st.ruleBit, open === 'field' && st.ruleOpen]} onPress={() => (open ? setPick(null) : openField(i))} accessibilityLabel="Rule field">
        <Text style={st.ruleText} numberOfLines={1}>{fieldName(r.field)}</Text>
        <Icon name={open === 'field' ? 'up' : 'down'} size={px(18)} />
      </Pressable>
      <Pressable style={[st.ruleBit, r.op === 'not' && st.btnDark]} onPress={() => setRule(i, {op: r.op === 'has' ? 'not' : 'has'})} accessibilityLabel="Include or exclude">
        <Text style={[st.ruleText, r.op === 'not' && {color: '#ffffff'}]}>{r.field === 'title' ? (r.op === 'has' ? 'has' : "doesn't have") : r.op === 'has' ? 'is' : 'is not'}</Text>
      </Pressable>
      <Pressable style={[st.ruleBit, {flex: 1}, open === 'value' && st.ruleOpen]} onPress={() => (open ? setPick(null) : openValue(i))} accessibilityLabel="Rule value">
        <Text style={[st.ruleText, !r.value && {color: '#888888'}]} numberOfLines={1}>{r.value || 'choose…'}</Text>
        <Icon name={open === 'value' ? 'up' : 'down'} size={px(18)} />
      </Pressable>
      <IconBtn name="close" label="Remove rule" onPress={() => { setPick(null); setC({...c, rules: c.rules.filter((_, j) => j !== i)}); }} size={px(40)} style={{marginLeft: px(6)}} />
    </View>
  );
  return (
    <>
      <Header title={start ? 'Edit collection' : 'New collection'} left="Back" onLeft={onCancel} />
      <View style={{flex: 1}}>
      <View style={[st.pad, {flex: 1}]}>
        {!start ? (
          <>
            <Text style={st.small}>Start from:</Text>
            <View style={st.pillWrap}>
              {COLLECTION_TEMPLATES.map(t => <Pill key={t.id} label={t.name} onPress={() => setC({...t, id: Date.now().toString(36), add: [], remove: []})} />)}
            </View>
          </>
        ) : null}
        <Text style={st.label}>Name</Text>
        <TextInput style={st.input} value={c.name} onChangeText={t => setC({...c, name: t})} placeholder="e.g. Cosy reads, To reread, Book club" />
        <View style={[st.dataHead, {marginTop: px(16)}]}>
          <Text style={st.dataTitle}>Add books by themselves when</Text>
        </View>
        {c.rules.length > 1 ? (
          <View style={st.modeRow}>
            <Pill label="all of these fit" active={c.match === 'all'} onPress={() => setC({...c, match: 'all'})} />
            <Pill label="any of these fits" active={c.match === 'any'} onPress={() => setC({...c, match: 'any'})} />
          </View>
        ) : null}
        <View onLayout={e => (rowsY.current = e.nativeEvent.layout.y)}>
          {c.rules.map((r, i) => (
            <View key={i} onLayout={e => (rowY.current[i] = e.nativeEvent.layout.y)}>{ruleRow(r, i)}</View>
          ))}
        </View>
        <Btn small icon="plus" label="Add a rule" onPress={() => setC({...c, rules: [...c.rules, {field: 'genre', op: 'has', value: ''}]})} style={{marginTop: px(6)}} />
        <Text style={[st.small, {marginTop: px(10)}]}>{c.rules.length ? `${n} book${n === 1 ? '' : 's'} in it now${c.add.length ? ` (${c.add.length} added by hand)` : ''}. Rules keep it up to date by themselves.` : 'No rules: only books you add from a book page.'}</Text>
        <View style={{flex: 1}} />
        <Btn dark icon="check" label="Save collection" onPress={() => c.name.trim() && onSave({...c, name: c.name.trim(), rules: c.rules.filter(r => r.value)})} style={!c.name.trim() ? st.dim : undefined} />
        {onDelete ? (
          sure ? (
            <View style={{flexDirection: 'row', marginTop: px(10)}}>
              <Btn small dark icon="trash" label="Delete this collection" onPress={onDelete} style={{flex: 1}} />
              <IconBtn name="close" label="Keep it" onPress={() => setSure(false)} style={{marginLeft: px(8)}} />
            </View>
          ) : (
            <Btn small icon="trash" label="Delete collection (books stay)" onPress={() => setSure(true)} style={{marginTop: px(10)}} />
          )
        ) : null}
      </View>
      {pick && c.rules[pick.row] ? (
        // drops down under the rule; everything else is dimmed (tap there to close)
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(0,0,0,0.3)'}]} onPress={() => setPick(null)} accessibilityLabel="Close the list" />
          <View style={{position: 'absolute', left: 0, right: 0, top: rowsY.current + (rowY.current[pick.row] || 0) - px(6), paddingHorizontal: px(10)}}>
            <View style={st.ruleDrop}>
              {ruleRow(c.rules[pick.row], pick.row, pick.title === 'Look at' ? 'field' : 'value')}
              {pick.typed ? (
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: px(4)}}>
                  <TextInput style={[st.input, {flex: 1, marginBottom: 0}]} value={typed} onChangeText={setTyped} placeholder={pick.options.length ? 'Or type a new one' : 'Type the words'} />
                  <IconBtn dark name="check" label="Use this" onPress={() => { if (typed.trim()) { pick.onPick(typed.trim()); setTyped(''); setPick(null); } }} style={{marginLeft: px(8)}} />
                </View>
              ) : null}
              {pick.options.length ? (
                <View style={[st.pillWrap, {marginTop: px(8)}]}>
                  {pick.options.slice(0, 48).map(o => <Pill key={o} label={o} active={o === pick.current} onPress={() => { pick.onPick(o); setPick(null); }} />)}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
      </View>
    </>
  );
}

// ---------- leave folders or files out of a library ----------
function ExcludePage({lib, path, onGo, setExclude, onDone}: {lib: Lib; path: string; onGo: (p: string) => void; setExclude: (ex: string[]) => void; onDone: () => void}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [pg, setPg] = useState(0);
  const ex = lib.exclude || [];
  useEffect(() => {
    setPg(0);
    listDir(path ? `${lib.path}/${path}` : lib.path).then(list =>
      setEntries(list.filter(e => !e.name.startsWith('.') && (e.isDir || /\.(epub|pdf|cbz|fb2|xps|mobi|txt|docx)$/i.test(e.name))).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, {numeric: true}))),
    );
  }, [lib.path, path]);
  const rel = (e: Entry) => (path ? `${path}/${e.name}` : e.name);
  const hiddenAbove = path.split('/').some((_, i, a) => ex.includes(a.slice(0, i + 1).join('/')));
  const rowH = px(60);
  const per = Math.max(4, Math.floor((H - px(64) - px(150) - px(64) - px(80)) / rowH));
  const list = entries || [];
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(pg, pages - 1);
  return (
    <>
      <Header title={`Leave out of ${lib.name}`} left="Back" onLeft={onDone} />
      <View style={[st.pad, {flex: 1, paddingBottom: 0}]}>
        <Text style={st.small}>{'Tap the eye to leave a folder or book out (for example a big folder you picked by accident). It stays left out after refreshing, and it is kept in the backup.'}</Text>
        <View style={[st.crumbBar, {paddingHorizontal: 0}]}>
          <IconBtn name="up" label="Up one folder" disabled={!path} onPress={() => onGo(path.split('/').slice(0, -1).join('/'))} size={px(42)} />
          <Text style={[st.small, {flex: 1, marginLeft: px(10), color: BLACK}]} numberOfLines={1}>{[lib.name, ...path.split('/').filter(Boolean)].join('  ›  ')}</Text>
          {ex.length ? <Btn small icon="eye" label={`Show all ${ex.length}`} onPress={() => setExclude([])} /> : null}
        </View>
        {hiddenAbove ? <Text style={[st.small, {marginVertical: px(6)}]}>A folder above this one is left out, so everything here is too.</Text> : null}
        {entries && !list.length ? <Text style={st.para}>Nothing here.</Text> : null}
        {list.slice(p * per, (p + 1) * per).map(e => {
          const off = ex.includes(rel(e));
          return (
            <View key={e.path} style={[st.folderRow, {height: rowH, flexDirection: 'row', alignItems: 'center'}, off && {opacity: 0.55}]}>
              <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => (e.isDir ? onGo(rel(e)) : setExclude(off ? ex.filter(x => x !== rel(e)) : [...ex, rel(e)]))} accessibilityLabel={e.isDir ? `Open ${e.name}` : e.name}>
                <Icon name={e.isDir ? 'folder' : 'new'} size={px(26)} />
                <Text style={[st.folderName, {flex: 1, marginLeft: px(12)}, off && {textDecorationLine: 'line-through'}]} numberOfLines={1}>{e.name}</Text>
                {off ? <Text style={[st.small, {marginRight: px(8)}]}>left out</Text> : null}
                {e.isDir ? <Icon name="forward" size={px(22)} /> : null}
              </Pressable>
              <IconBtn name={off ? 'hide' : 'eye'} dark={off} label={off ? `Show ${e.name}` : `Leave out ${e.name}`} onPress={() => setExclude(off ? ex.filter(x => x !== rel(e)) : [...ex, rel(e)])} style={{marginLeft: px(12)}} />
            </View>
          );
        })}
      </View>
      <View style={st.pager}>
        <IconBtn name="back" label="Previous page" disabled={p <= 0} onPress={() => setPg(p - 1)} />
        <Text style={st.pageText}>{`${p + 1} / ${pages}`}</Text>
        <IconBtn name="forward" label="Next page" disabled={p >= pages - 1} onPress={() => setPg(p + 1)} />
      </View>
      <View style={[st.pad, {paddingTop: 0}]}>
        <Btn dark icon="check" label="Done" onPress={onDone} />
      </View>
    </>
  );
}


// ---------- how to use: search the guides ----------
function HelpPage({q, setQ, onOpen}: {q: string; setQ: (q: string) => void; onOpen: (t: HelpTopic) => void}) {
  const [pg, setPg] = useState(0);
  const found = searchHelp(q);
  const rowH = px(86);
  const per = Math.max(3, Math.floor((H - px(64) - px(84) - px(64) - TASK_H - px(10)) / rowH));
  const pages = Math.max(1, Math.ceil(found.length / per));
  const p = Math.min(pg, pages - 1);
  return (
    <>
      <View style={[st.pad, {paddingBottom: px(6)}]}>
        <View style={st.helpSearch}>
          <Icon name="search" size={px(26)} />
          <TextInput style={st.helpInput} value={q} onChangeText={t => { setQ(t); setPg(0); }} placeholder="Search the guides, e.g. cover, backup, series" />
          {q ? <IconBtn bare name="close" label="Clear search" onPress={() => setQ('')} size={px(40)} /> : null}
        </View>
      </View>
      <View style={{flex: 1, paddingHorizontal: px(16)}}>
        {!found.length ? <Text style={st.para}>{`Nothing about "${q}". Try another word.`}</Text> : null}
        {found.slice(p * per, (p + 1) * per).map(t => (
          <Pressable key={t.id} style={[st.row, {height: rowH, alignItems: 'center'}]} onPress={() => onOpen(t)} accessibilityLabel={t.title}>
            <View style={st.libIcon}><Icon name={t.icon as IconName} size={px(30)} /></View>
            <View style={{flex: 1}}>
              <Text style={st.rowTitle} numberOfLines={1}>{t.title}</Text>
              <Text style={st.small} numberOfLines={2}>{t.steps[0]}</Text>
            </View>
            <Icon name="forward" size={px(24)} />
          </Pressable>
        ))}
      </View>
      <View style={st.pager}>
        <IconBtn name="back" label="Previous page" disabled={p <= 0} onPress={() => setPg(p - 1)} />
        <Text style={st.pageText}>{q ? `${found.length} found  ·  ${p + 1} / ${pages}` : `${p + 1} / ${pages}`}</Text>
        <IconBtn name="forward" label="Next page" disabled={p >= pages - 1} onPress={() => setPg(p + 1)} />
      </View>
    </>
  );
}



// ---------- the grid of collections ----------
function CollectionGrid({items, onOpen, onNew}: {
  items: {id: string; name: string; count: number; covers: {cover: string | null; title: string}[]; auto: boolean}[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [pg, setPg] = useState(0);
  const cols = 3, rows = 3;
  const cells = [...items.map(x => ({...x, add: false})), {id: '+', name: 'New collection', count: 0, covers: [], auto: false, add: true}];
  const per = cols * rows;
  const pages = Math.max(1, Math.ceil(cells.length / per));
  const p = Math.min(pg, pages - 1);
  const avail = H - px(64) - px(64) - TASK_H - px(30);
  const cellW = Math.floor((W - px(24) - (cols - 1) * px(14)) / cols);
  const cellH = Math.floor(avail / rows) - px(14);
  const coverH = cellH - px(70);
  const cw = Math.floor((cellW - px(16) - px(6)) / 2);
  const ch = Math.floor((coverH - px(6)) / 2);
  return (
    <>
      <View style={{flex: 1, paddingHorizontal: px(12), paddingTop: px(14)}}>
        {Array.from({length: rows}).map((_, r) => (
          <View key={r} style={{flexDirection: 'row', marginBottom: px(14)}}>
            {cells.slice(p * per + r * cols, p * per + r * cols + cols).map((c, i) => (
              <Pressable key={c.id} onPress={() => (c.add ? onNew() : onOpen(c.id))} style={[st.colTile, {width: cellW, height: cellH, marginLeft: i ? px(14) : 0}, c.add && {borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center'}]} accessibilityLabel={c.add ? 'New collection' : `Open ${c.name}`}>
                {c.add ? (
                  <>
                    <Icon name="plus" size={px(36)} />
                    <Text style={[st.small, {marginTop: px(8)}]}>New collection</Text>
                  </>
                ) : (
                  <>
                    <View style={{height: coverH, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between', backgroundColor: '#f2f2f2', borderRadius: px(10), padding: c.covers.length ? 0 : px(8)}}>
                      {c.covers.length ? c.covers.map((x, k) => <Cover key={k} uri={x.cover} w={cw} h={ch} title={x.title} />) : <Text style={[st.small, {margin: px(8)}]}>Empty</Text>}
                    </View>
                    <Text style={[st.rowTitle, {fontSize: px(18), marginTop: px(8)}]} numberOfLines={1}>{c.name}</Text>
                    <Text style={st.small} numberOfLines={1}>{`${c.count} book${c.count === 1 ? '' : 's'}${c.auto ? '  ·  auto' : ''}`}</Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <View style={st.pager}>
        <IconBtn name="back" label="Previous page" disabled={p <= 0} onPress={() => setPg(p - 1)} />
        <Text style={st.pageText}>{`${p + 1} / ${pages}`}</Text>
        <IconBtn name="forward" label="Next page" disabled={p >= pages - 1} onPress={() => setPg(p + 1)} />
      </View>
    </>
  );
}

// ---------- data and storage ----------
function DataPage(props: {
  libs: Lib[];
  info: (l: Lib) => {books: number | null; line: string; when: string; busy: boolean};
  missing: Settings['missing'];
  setMissing: (v: Settings['missing']) => void;
  missingCount: number;
  onOpen: (l: Lib) => void;
  onRefresh: (l?: Lib) => void;
  onRemove: (l: Lib) => void;
  onAdd: () => void;
  onPicker: () => void;
  onMissing: () => void;
  onExclude: (l: Lib) => void;
  sheet: {when: number | null; onMake: () => void; onRead: () => void; onHelp: () => void};
  backup: {dir: string; when: number | null; onNow: () => void; onMove: () => void; onRestore: () => void};
}) {
  const {libs, info, missing, setMissing, missingCount, onOpen, onRefresh, onRemove, onAdd, onPicker, onMissing, backup, onExclude, sheet} = props;
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pg, setPg] = useState(0);
  const [tab, setTab] = useState<'libs' | 'backup' | 'missing'>('libs');
  const per = 4;
  const pages = Math.max(1, Math.ceil(libs.length / per));
  const p = Math.min(pg, pages - 1);
  const where = (path: string) => (path === '/storage/emulated/0' ? 'Supernote' : path.replace('/storage/emulated/0', 'Supernote').replace(/^\/storage\/[^/]+/, 'SD card'));
  const tabs: {t: typeof tab; label: string}[] = [
    {t: 'libs', label: 'Libraries'},
    {t: 'backup', label: 'Backup and sheet'},
    {t: 'missing', label: `Missing books${missingCount ? ` (${missingCount})` : ''}`},
  ];
  return (
    <View style={[st.pad, {flex: 1}]}>
      <View style={[st.sheetTabs, {marginBottom: px(14)}]}>
        {tabs.map(x => (
          <Pressable key={x.t} onPress={() => setTab(x.t)} style={[st.sheetTab, tab === x.t && st.sheetTabOn]} accessibilityLabel={x.label}>
            <Text style={[st.sheetTabText, tab === x.t && {fontWeight: 'bold'}]} numberOfLines={1}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'libs' ? (
      <>
      {!hasNative() && <Text style={st.warn}>This copy of InkShelf is missing its native part, so it can't read folders or open books.</Text>}
      <View style={st.dataHead}>
        <Text style={st.dataTitle}>Libraries</Text>
        <View style={{flexDirection: 'row'}}>
          {libs.length ? <IconBtn name="refresh" label="Refresh all libraries" onPress={() => onRefresh()} style={{marginRight: px(10)}} /> : null}
          <IconBtn dark name="folder-plus" label="Add a library folder" onPress={onAdd} />
        </View>
      </View>
      {libs.length === 0 ? (
        <View style={st.welcome}>
          <Text style={st.para}>Add a folder with your books (EPUB, PDF and more). InkShelf finds every book inside it, including subfolders.</Text>
          <Btn dark icon="folder-plus" label="Add a folder" onPress={onAdd} />
          <Btn small icon="search" label="Or pick a book with Supernote's file picker" onPress={onPicker} style={{marginTop: px(10)}} />
        </View>
      ) : null}
      <View style={{height: Math.min(libs.length, per) * px(118)}}>
        {libs.slice(p * per, (p + 1) * per).map(l => {
          const i = info(l);
          const sure = confirm === l.path;
          return (
            <View key={l.path} style={[st.libCard, {height: px(106)}]}>
              <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => onOpen(l)} accessibilityLabel={`Open ${l.name}`}>
                <View style={st.libIcon}><Icon name={/^\/storage\/[^/]+$/.test(l.path) && !l.path.startsWith('/storage/emulated') ? 'database' : 'folder'} size={px(32)} /></View>
                <View style={{flex: 1}}>
                  <Text style={st.libName} numberOfLines={1}>{l.name}</Text>
                  <Text style={[st.small, {fontWeight: 'bold'}]} numberOfLines={1}>{i.line}</Text>
                  <Text style={st.small} numberOfLines={1}>{[where(l.path), l.exclude?.length ? `${l.exclude.length} left out` : '', i.busy ? 'checking now' : i.when ? `checked ${i.when}` : ''].filter(Boolean).join('  ·  ')}</Text>
                </View>
              </Pressable>
              {sure ? (
                <>
                  <Btn small dark icon="trash" label="Remove" onPress={() => { setConfirm(null); onRemove(l); }} style={{marginLeft: px(8)}} />
                  <IconBtn name="close" label="Keep it" onPress={() => setConfirm(null)} style={{marginLeft: px(8)}} />
                </>
              ) : (
                <>
                  <IconBtn name="hide" label={`Leave folders out of ${l.name}`} onPress={() => onExclude(l)} style={{marginLeft: px(8)}} />
                  <IconBtn name="refresh" label={`Refresh ${l.name}`} onPress={() => onRefresh(l)} disabled={i.busy} style={{marginLeft: px(8)}} />
                  <IconBtn name="trash" label={`Remove ${l.name}`} onPress={() => setConfirm(l.path)} style={{marginLeft: px(8)}} />
                </>
              )}
            </View>
          );
        })}
      </View>
      {pages > 1 ? <Arrows page={p} pages={pages} onPage={setPg} /> : null}

      </>
      ) : null}
      {tab === 'backup' ? (
      <>
      <View style={st.dataHead}>
        <Text style={st.dataTitle}>Backup</Text>
        <Text style={st.small}>{backup.when ? `Saved ${ago(backup.when)}` : 'Saves by itself after every change'}</Text>
      </View>
      <View style={[st.libCard, {flexDirection: 'column', alignItems: 'stretch', height: undefined}]}>
        <Text style={[st.small, {color: BLACK}]} numberOfLines={2}>
          {'Everything InkShelf wrote (libraries, details, notes, covers chosen, bookmarks, settings) in one file. After reinstalling InkShelf, it reads it back by itself.'}
        </Text>
        <Text style={[st.choiceTitle, {fontSize: px(17), marginTop: px(6)}]} numberOfLines={1}>{`${where(backup.dir).replace('Supernote/', '')}  ›  ${BACKUP_NAME}`}</Text>
        <View style={{flexDirection: 'row', marginTop: px(8)}}>
          <Btn small dark icon="save" label="Back up now" onPress={backup.onNow} style={{flex: 1}} />
          <Btn small icon="folder" label="Change folder" onPress={backup.onMove} style={{flex: 1, marginLeft: px(8)}} />
          <Btn small icon="restore" label="Restore" onPress={backup.onRestore} style={{flex: 1, marginLeft: px(8)}} />
        </View>
      </View>

      <View style={[st.dataHead, {marginTop: px(8)}]}>
        <Text style={st.dataTitle}>Book details sheet</Text>
        <Text style={st.small}>{sheet.when ? `Updated ${ago(sheet.when)}` : ''}</Text>
      </View>
      <View style={[st.libCard, {flexDirection: 'column', alignItems: 'stretch', height: undefined}]}>
        <Text style={[st.small, {color: BLACK}]} numberOfLines={4}>{`Fill in many books at once on a computer: open Document › InkShelf › ${XLSX_NAME} in Excel or Google Sheets, then copy it back. InkShelf reads the changes by itself.`}</Text>
        <View style={{flexDirection: 'row', marginTop: px(8)}}>
          <Btn small icon="save" label="Make the sheet" onPress={sheet.onMake} style={{flex: 1}} />
          <Btn small icon="restore" label="Read changes now" onPress={sheet.onRead} style={{flex: 1, marginLeft: px(8)}} />
          <IconBtn name="help" label="How to fill in the sheet" onPress={sheet.onHelp} style={{marginLeft: px(8)}} />
        </View>
      </View>
      </>
      ) : null}
      {tab === 'missing' ? (
      <>
      <Text style={[st.dataTitle, {marginBottom: px(6)}]}>When a book's file disappears</Text>
      <View style={{flexDirection: 'row'}}>
        <Pressable style={[st.dChoice, {flex: 1, marginRight: px(8)}, missing === 'flag' && st.dChoiceOn]} onPress={() => setMissing('flag')} accessibilityLabel="Keep details and flag it">
          <View style={[st.dRadio, missing === 'flag' && st.dRadioOn]} />
          <View style={{flex: 1}}>
            <Text style={[st.choiceTitle, {fontSize: px(17)}]}>Keep and flag it</Text>
            <Text style={st.small} numberOfLines={2}>{'Reconnects when the file is back.'}</Text>
          </View>
        </Pressable>
        <Pressable style={[st.dChoice, {flex: 1}, missing === 'delete' && st.dChoiceOn]} onPress={() => setMissing('delete')} accessibilityLabel="Delete details right away">
          <View style={[st.dRadio, missing === 'delete' && st.dRadioOn]} />
          <View style={{flex: 1}}>
            <Text style={[st.choiceTitle, {fontSize: px(17)}]}>Delete its details</Text>
            <Text style={st.small} numberOfLines={2}>{'Never when the card is out.'}</Text>
          </View>
        </Pressable>
      </View>
      <Pressable style={[st.libCard, {height: px(58), marginBottom: 0}]} onPress={onMissing} accessibilityLabel="Missing links">
        <Icon name="unlink" size={px(28)} />
        <Text style={[st.choiceTitle, {flex: 1, marginLeft: px(12)}]}>{`See the missing links  (${missingCount})`}</Text>
        <Icon name="forward" size={px(24)} />
      </Pressable>
      <Text style={[st.small, {marginTop: px(10)}]}>{'A missing link is a book whose file was moved, renamed or deleted. Its details are kept and reconnect by themselves when the file is back.'}</Text>
      </>
      ) : null}
    </View>
  );
}

function MissingList({items, paging, onForget, onForgetAll, onOpen}: {
  items: {l: Lib; b: Book; m: Meta}[];
  paging: Settings['paging'];
  onForget: (x: {l: Lib; b: Book}) => void;
  onForgetAll: () => void;
  onOpen: (x: {l: Lib; b: Book}) => void;
}) {
  const [sure, setSure] = useState(false);
  const top = px(64) + px(120);
  return (
    <>
      <View style={[st.pad, {paddingBottom: 0}]}>
        <Text style={st.small}>{"These books' files are gone, but their details are kept. They reconnect by themselves when the file is back. Delete the ones you don't need."}</Text>
        <View style={{flexDirection: 'row', marginTop: px(10)}}>
          {items.length ? (
            sure ? (
              <>
                <Btn small dark icon="trash-all" label={`Delete all ${items.length}`} onPress={() => { setSure(false); onForgetAll(); }} style={{flex: 1}} />
                <Btn small icon="close" label="Keep them" onPress={() => setSure(false)} style={{marginLeft: px(10)}} />
              </>
            ) : (
              <Btn small icon="trash-all" label="Delete all" onPress={() => setSure(true)} />
            )
          ) : null}
        </View>
      </View>
      <Collection
        items={items.map(x => ({
          key: x.l.path + x.b.key,
          title: x.m.title || x.b.fileTitle,
          sub: [x.l.name, x.b.dir || '', `gone since ${ago(x.b.added)}`].filter(Boolean).join('  ·  '),
          cover: x.m.cover,
          pills: x.m.genres,
          onPress: () => onOpen(x),
          action: {icon: 'trash' as IconName, label: 'Delete its details', onPress: () => onForget(x)},
        }))}
        grid={false}
        top={top}
        paging={paging}
        empty="No missing links. Every book with details has its file."
      />
    </>
  );
}

// ---------- folders inside a library: make a folder one book, or combine books by hand ----------
function FolderView({books, libName, title, cover, wantCovers, avail, onOpen, onMakeSeries, onSplit, onCombine}: {
  books: Book[];
  libName: string;
  title: (b: Book) => string;
  cover: (b: Book) => string | null;
  wantCovers: (l: Book[]) => void;
  avail: number;
  onOpen: (b: Book) => void;
  onMakeSeries: (dir: string) => void;
  onSplit: (b: Book) => void;
  onCombine: (list: Book[], title: string) => void;
}) {
  const [dir, setDir] = useState('');
  const [pg, setPg] = useState(0);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => { setPg(0); setPicked([]); setPicking(false); setNaming(false); setSure(false); }, [dir]);
  const inside = (b: Book) => (dir ? b.dir === dir || b.dir.startsWith(dir + '/') : true);
  // folders right under this one (a series folder shows as its book instead)
  const subs = Array.from(new Set(books.filter(b => inside(b) && b.dir !== dir).map(b => (dir ? b.dir.slice(dir.length + 1) : b.dir).split('/')[0]))).sort((a, b) =>
    a.localeCompare(b, undefined, {numeric: true}),
  );
  const seriesHere = (d: string) => books.find(b => b.dir === d && (b.series === 'auto' || b.series === 'folder'));
  type Row = {kind: 'folder'; name: string; path: string; n: number} | {kind: 'book'; b: Book};
  const rows: Row[] = [];
  for (const n of subs) {
    const path = dir ? `${dir}/${n}` : n;
    const s = seriesHere(path);
    const within = books.filter(b => b.dir === path || b.dir.startsWith(path + '/'));
    if (s && within.length === 1) rows.push({kind: 'book', b: s});
    else if (within.length === 1) rows.push({kind: 'book', b: within[0]}); // a folder holding one book shows the book
    else rows.push({kind: 'folder', name: n, path, n: books.filter(b => b.dir === path || b.dir.startsWith(path + '/')).length});
  }
  books.filter(b => b.dir === dir && !(b.series === 'auto' || b.series === 'folder') ).forEach(b => rows.push({kind: 'book', b}));
  const rowH = px(84);
  const per = Math.max(3, Math.floor((avail - px(70) - (naming ? px(70) : 0)) / rowH));
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(pg, pages - 1);
  const shown = rows.slice(p * per, (p + 1) * per);
  const shownBooks = shown.filter(r => r.kind === 'book').map(r => (r as {b: Book}).b);
  wantCovers(shownBooks);
  const crumbs = [libName, ...dir.split('/').filter(Boolean)];
  const pickedBooks = books.filter(b => picked.includes(b.key));
  const startNaming = () => {
    const t = pickedBooks.map(title);
    let pre = t[0] || '';
    t.forEach(x => { while (pre && !x.toLowerCase().startsWith(pre.toLowerCase())) pre = pre.slice(0, -1); });
    pre = pre.replace(/[\s._\-–—:(]+$/, '').replace(/\s+(vol(ume)?|part|book)\.?$/i, '');
    setName(pre.length >= 3 ? pre : dir.split('/').pop() || t[0] || '');
    setNaming(true);
  };
  const ch = rowH - px(16);
  return (
    <>
      <View style={st.crumbBar}>
        <IconBtn name="up" label="Up one folder" disabled={!dir} onPress={() => setDir(dir.split('/').slice(0, -1).join('/'))} size={px(42)} />
        <Text style={[st.small, {flex: 1, marginLeft: px(10), color: BLACK}]} numberOfLines={1}>{crumbs.join('  ›  ')}</Text>
        {picking ? (
          <>
            <Btn small dark icon="layers" label={`Combine ${picked.length}`} onPress={() => picked.length > 1 && startNaming()} style={[{marginLeft: px(8)}, picked.length < 2 && st.dim]} />
            <IconBtn name="close" label="Stop selecting" onPress={() => { setPicking(false); setPicked([]); setNaming(false); }} size={px(42)} style={{marginLeft: px(8)}} />
          </>
        ) : (
          <>
            {dir && !seriesHere(dir) ? (
              sure ? (
                <>
                  <Btn small dark icon="layers" label={`All ${books.filter(inside).length} as one book`} onPress={() => { setSure(false); onMakeSeries(dir); }} style={{marginLeft: px(8)}} />
                  <IconBtn name="close" label="Cancel" onPress={() => setSure(false)} size={px(42)} style={{marginLeft: px(8)}} />
                </>
              ) : (
                <Btn small icon="layers" label="Make one book" onPress={() => setSure(true)} style={{marginLeft: px(8)}} />
              )
            ) : null}
            {!sure ? <IconBtn name="select" label="Select books to combine" onPress={() => setPicking(true)} size={px(42)} style={{marginLeft: px(8)}} /> : null}
          </>
        )}
      </View>
      {naming ? (
        <View style={st.nameBar}>
          <TextInput style={[st.input, {flex: 1, marginBottom: 0}]} value={name} onChangeText={setName} placeholder="Name of the combined book" />
          <IconBtn dark name="check" label="Combine" onPress={() => { if (name.trim()) { onCombine(pickedBooks, name.trim()); setPicking(false); setPicked([]); setNaming(false); } }} style={{marginLeft: px(8)}} />
        </View>
      ) : null}
      <View style={{flex: 1, paddingHorizontal: px(10)}}>
        {!rows.length ? <Text style={[st.para, {padding: px(10)}]}>Nothing in this folder.</Text> : null}
        {shown.map(r => {
          if (r.kind === 'folder') {
            return (
              <View key={'d' + r.path} style={[st.row, {height: rowH, alignItems: 'center'}]}>
                <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => setDir(r.path)} accessibilityLabel={`Open ${r.name}`}>
                  <View style={[st.libIcon, {width: Math.round((ch * 2) / 3), height: ch}]}><Icon name="folder" size={px(30)} /></View>
                  <View style={{flex: 1}}>
                    <Text style={st.rowTitle} numberOfLines={1}>{r.name}</Text>
                    <Text style={st.small}>{`${r.n} book${r.n === 1 ? '' : 's'}`}</Text>
                  </View>
                  <Icon name="forward" size={px(24)} />
                </Pressable>
              </View>
            );
          }
          const b = r.b;
          const sel = picked.includes(b.key);
          return (
            <View key={b.key} style={[st.row, {height: rowH, alignItems: 'center'}]}>
              <Pressable
                style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}
                onPress={() => (picking ? setPicked(sel ? picked.filter(k => k !== b.key) : [...picked, b.key]) : onOpen(b))}
                accessibilityLabel={picking ? `Select ${title(b)}` : `Open ${title(b)}`}>
                {picking ? <View style={[st.triBox, {marginRight: px(10)}, sel && st.btnDark]}>{sel ? <Icon name="check" size={px(22)} color="#ffffff" /> : null}</View> : null}
                <Cover uri={cover(b)} w={Math.round((ch * 2) / 3)} h={ch} title={title(b)} />
                <View style={st.rowText}>
                  <Text style={st.rowTitle} numberOfLines={2}>{title(b)}</Text>
                  <Text style={st.small} numberOfLines={1}>
                    {b.vols.length > 1 ? `${b.vols.length} files as one book${b.series === 'group' ? ' (combined by you)' : b.series ? ' (one folder)' : ''}` : (b.files[0] || '').split('/').pop()}
                  </Text>
                </View>
              </Pressable>
              {!picking && b.series ? <Btn small icon="split" label="Split" onPress={() => onSplit(b)} style={{marginLeft: px(10)}} /> : null}
            </View>
          );
        })}
      </View>
      <View style={st.pager}>
        <IconBtn name="back" label="Previous page" disabled={p <= 0} onPress={() => setPg(p - 1)} />
        <Text style={st.pageText}>{picking ? `${picked.length} selected  ·  ${p + 1} / ${pages}` : `${p + 1} / ${pages}`}</Text>
        <IconBtn name="forward" label="Next page" disabled={p >= pages - 1} onPress={() => setPg(p + 1)} />
      </View>
    </>
  );
}

// ---------- rows for books remembered across libraries ----------
function SnapRow({x, cover, onPress, right, h}: {x: Snap; cover?: string | null; onPress: () => void; right?: React.ReactNode; h: number}) {
  const ch = h - px(14);
  return (
    <Pressable style={[st.row, {height: h, alignItems: 'center'}]} onPress={onPress}>
      <Cover uri={cover !== undefined ? cover : x.cover} w={Math.round((ch * 2) / 3)} h={ch} title={x.title} />
      <View style={[st.rowText, {alignSelf: 'stretch'}]}>
        <Text style={st.rowTitle} numberOfLines={2}>{x.title}</Text>
        <Text style={[st.small, {marginTop: px(3)}]} numberOfLines={1}>{[x.libName, x.folder].filter(Boolean).join('  ·  ') + (x.vol ? `  ·  Vol ${x.vol}` : '')}</Text>
        {x.genres?.length ? (
          <View style={[st.pillLine, {marginTop: px(6)}]}>{x.genres.slice(0, 3).map(g => <Pill small key={g} label={g} />)}</View>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

function Chips({options, value, onChange}: {options: {id: string; label: string}[]; value: string; onChange: (id: string) => void}) {
  return (
    <View style={st.chipsRow}>
      {options.map(o => (
        <Pressable key={o.id} onPress={() => onChange(o.id)} style={[st.fchip, value === o.id && st.btnDark]}>
          <Text style={[st.fchipText, value === o.id && {color: '#ffffff'}]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Pager({p, pages, setP, note}: {p: number; pages: number; setP: (n: number) => void; note?: string}) {
  return (
    <View style={st.pager}>
      <IconBtn name="back" label="Previous page" disabled={p <= 0} onPress={() => setP(p - 1)} />
      <Text style={st.pageText}>{`${note ? note + '  ·  ' : ''}${p + 1} / ${pages}`}</Text>
      <IconBtn name="forward" label="Next page" disabled={p >= pages - 1} onPress={() => setP(p + 1)} />
    </View>
  );
}

/** one thing in a list or grid page */
type CItem = {
  key: string;
  title: string;
  sub?: string;
  cover?: string | null;
  pills?: string[];
  marks?: string[]; // black labels, e.g. "No summary"
  vol?: number;
  isNew?: boolean;
  onPress: () => void;
  action?: {icon: IconName; label: string; onPress: () => void; dark?: boolean};
};

/** count on the left, list/grid buttons on the right */
function Toolbar({text, grid, setGrid, extra}: {text: string; grid: boolean; setGrid: (g: boolean) => void; extra?: React.ReactNode}) {
  return (
    <View style={st.toolbar}>
      <Text style={[st.resCount, {flex: 1}]} numberOfLines={1}>{text}</Text>
      <View style={{flexDirection: 'row'}}>
        {extra}
        <ViewIcon kind="list" on={!grid} onPress={() => setGrid(false)} />
        <ViewIcon kind="grid" on={grid} onPress={() => setGrid(true)} />
      </View>
    </View>
  );
}

/**
 * A page of books as a list (rows) or a grid (4 across, 3 down, filling the space).
 * Turns pages with arrows by default, or scrolls when Settings say so.
 */
function Collection({items, grid, top, paging, empty}: {items: CItem[]; grid: boolean; top: number; paging: Settings['paging']; empty?: string}) {
  const [pg, setPg] = useState(0);
  const scroll = paging === 'scroll';
  const avail = H - top - TASK_H - (scroll ? 0 : px(64)) - px(6);
  const rowH = px(120);
  const cols = 4;
  const rowsG = 3;
  const cellW = Math.floor((W - px(28) - (cols - 1) * px(12)) / cols);
  const cellH = Math.floor(avail / rowsG);
  const coverH = Math.min(cellH - px(58) - px(16), Math.round((cellW - px(16)) * 1.5));
  const coverW = Math.round(coverH / 1.5);
  const per = grid ? cols * rowsG : Math.max(1, Math.floor(avail / rowH));
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(pg, pages - 1);
  const shown = scroll ? items : items.slice(p * per, (p + 1) * per);
  if (!items.length) return <View style={[st.pad, {flex: 1}]}><Text style={st.para}>{empty || 'Nothing here yet.'}</Text></View>;

  const row = (x: CItem) => {
    const ch = rowH - px(14);
    return (
      <Pressable key={x.key} style={[st.row, {height: rowH, alignItems: 'center'}]} onPress={x.onPress}>
        <Cover uri={x.cover} w={Math.round((ch * 2) / 3)} h={ch} title={x.title} isNew={x.isNew} />
        <View style={[st.rowText, {alignSelf: 'stretch'}]}>
          <Text style={st.rowTitle} numberOfLines={2}>{x.title}</Text>
          {x.sub ? <Text style={[st.small, {marginTop: px(3)}]} numberOfLines={1}>{x.sub}</Text> : null}
          <View style={[st.pillLine, {marginTop: px(6)}]}>
            {(x.marks || []).map(t => <Pill small active key={t} label={t} />)}
            {(x.pills || []).slice(0, 3).map(t => <Pill small key={t} label={t} />)}
          </View>
        </View>
        {x.action ? <IconBtn name={x.action.icon} label={x.action.label} dark={x.action.dark} onPress={x.action.onPress} style={{marginLeft: px(8)}} /> : null}
      </Pressable>
    );
  };
  const cell = (x: CItem, i: number) => (
    <Pressable key={x.key} onPress={x.onPress} style={{width: cellW, height: cellH, marginLeft: i % cols ? px(12) : 0, alignItems: 'center'}}>
      <View style={[st.card, {width: cellW, alignItems: 'center'}]}>
        <Cover uri={x.cover} w={coverW} h={coverH} title={x.title} isNew={x.isNew} />
        {x.vol ? <View style={st.volBadge}><Text style={st.volBadgeText}>{`Vol ${x.vol}`}</Text></View> : null}
        {x.marks?.length ? (
          <View style={st.markBadge}>
            {x.marks.map(t => <Text key={t} style={st.volBadgeText}>{t}</Text>)}
          </View>
        ) : null}
        {x.action ? (
          <IconBtn name={x.action.icon} label={x.action.label} dark={x.action.dark} onPress={x.action.onPress} size={px(40)} style={{position: 'absolute', right: px(4), bottom: px(4)}} />
        ) : null}
      </View>
      <Text style={[st.cardTitle, {alignSelf: 'stretch'}]} numberOfLines={1}>{x.title}</Text>
      {x.sub ? <Text style={[st.cardSub, {alignSelf: 'stretch'}]} numberOfLines={1}>{x.sub}</Text> : null}
    </Pressable>
  );
  const body = grid ? (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: px(14), paddingTop: px(4)}}>{shown.map(cell)}</View>
  ) : (
    <View style={{paddingHorizontal: px(14)}}>{shown.map(row)}</View>
  );
  return scroll ? (
    <ScrollView style={{flex: 1}}>{body}</ScrollView>
  ) : (
    <>
      <View style={{flex: 1}}>{body}</View>
      <Pager p={p} pages={pages} setP={setPg} />
    </>
  );
}

function SnapList({items, libs, paging, grid, setGrid, empty, onOpen, onRemove, top = 0}: {items: Snap[]; libs: Lib[]; paging: Settings['paging']; grid: boolean; setGrid: (g: boolean) => void; empty: string; onOpen: (x: Snap) => void; onRemove?: (x: Snap) => void; top?: number}) {
  const [which, setWhich] = useState('all');
  const opts = [{id: 'all', label: 'All'}, ...libs.filter(l => items.some(x => x.lib === l.path)).map(l => ({id: l.path, label: l.name}))];
  const shown = items.filter(x => which === 'all' || x.lib === which);
  const chips = opts.length > 2;
  return (
    <>
      {chips ? <Chips options={opts} value={which} onChange={setWhich} /> : null}
      <Toolbar text={`${shown.length} saved`} grid={grid} setGrid={setGrid} />
      <Collection
        key={which + grid}
        grid={grid}
        top={px(64) + top + (chips ? px(62) : 0) + px(60)}
        paging={paging}
        empty={empty}
        items={shown.map(x => ({
          key: x.lib + x.key,
          title: x.title,
          sub: [x.folder || x.libName, x.vol ? `Vol ${x.vol}` : ''].filter(Boolean).join('  ·  '),
          cover: x.cover,
          pills: x.genres,
          onPress: () => onOpen(x),
          action: onRemove ? {icon: 'close', label: 'Remove bookmark', onPress: () => onRemove(x)} : undefined,
        }))}
      />
    </>
  );
}

// ---------- newly added ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateText = (ms: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
function NewList({items, libs, ready, paging, grid, setGrid, cover, wantCovers, onEdit, onOpen, onAllSeen}: {
  onAllSeen: () => void;
  items: Found[];
  libs: Lib[];
  ready: boolean;
  paging: Settings['paging'];
  grid: boolean;
  setGrid: (g: boolean) => void;
  cover: (f: Found) => string | null;
  wantCovers: (l: Found[]) => void;
  onEdit: (f: Found) => void;
  onOpen: (f: Found) => void;
}) {
  const [which, setWhich] = useState('all');
  const noGenre = (f: Found) => !(f.meta.genres?.length || f.meta.tags?.length);
  const noSum = (f: Found) => !f.meta.description;
  const justAdded = items.filter(f => f.isNew).length;
  const shown = items.filter(f => which === 'all' || (which === 'just' ? f.isNew : which === 'genre' ? noGenre(f) : which === 'summary' ? noSum(f) : f.lib.path === which));
  wantCovers(shown);
  const opts = [
    {id: 'all', label: `All (${items.length})`},
    ...(justAdded ? [{id: 'just', label: `Just added (${justAdded})`}] : []),
    {id: 'genre', label: 'No genre'},
    {id: 'summary', label: 'No summary'},
    ...(libs.length > 1 ? libs.map(l => ({id: l.path, label: l.name})) : []),
  ];
  if (!items.length) {
    return (
      <View style={[st.pad, {flex: 1}]}>
        <Text style={st.para}>{ready ? 'All caught up. Every book has a genre and a summary.' : 'Looking through your libraries…'}</Text>
      </View>
    );
  }
  return (
    <>
      <Chips options={opts} value={which} onChange={setWhich} />
      <Toolbar text={`${shown.length} book${shown.length === 1 ? '' : 's'}  ·  newest first`} grid={grid} setGrid={setGrid} extra={justAdded ? <IconBtn name="check" label="Mark all as seen" onPress={onAllSeen} size={px(44)} style={{borderRadius: px(10)}} /> : null} />
      <Collection
        key={which + grid}
        grid={grid}
        top={px(64) + px(62) + px(60)}
        paging={paging}
        items={shown.map(f => ({
          key: f.lib.path + f.book.key,
          title: f.meta.title || f.book.fileTitle,
          sub: [f.book.folder || f.lib.name, f.book.added ? dateText(f.book.added) : ''].filter(Boolean).join('  ·  '),
          cover: cover(f),
          isNew: f.isNew,
          marks: [noGenre(f) ? 'No genre' : '', noSum(f) ? 'No summary' : ''].filter(Boolean),
          onPress: () => onOpen(f),
          action: {icon: 'edit', label: 'Add details', dark: true, onPress: () => onEdit(f)},
        }))}
      />
    </>
  );
}

// ---------- "view all" pages ----------
type GItem = {key: string; title: string; sub: string; cover: string | null | undefined; f?: Found; onPress: () => void};
function Gallery({items, label, paging, grid, setGrid, wantCovers}: {items: GItem[]; label: string; paging: Settings['paging']; grid: boolean; setGrid: (g: boolean) => void; wantCovers: (l: Found[]) => void}) {
  wantCovers(items.map(x => x.f).filter(Boolean) as Found[]);
  return (
    <>
      <Toolbar text={label} grid={grid} setGrid={setGrid} />
      <Collection key={String(grid)} grid={grid} top={px(64) + px(60)} paging={paging} items={items.map(x => ({key: x.key, title: x.title, sub: x.sub, cover: x.cover, onPress: x.onPress}))} />
    </>
  );
}

/** a cover sitting in a soft rounded card, as on the Home page */
function Card({uri, w, title}: {uri: string | null | undefined; w: number; title: string}) {
  const inner = w - px(16);
  return (
    <View style={[st.card, {width: w, height: Math.round(inner * 1.5) + px(16)}]}>
      <Cover uri={uri} w={inner} h={Math.round(inner * 1.5)} title={title} />
    </View>
  );
}

// ---------- home ----------
function Home(props: {
  libs: Lib[];
  index: Found[];
  ready: boolean;
  recent: {x: Snap; f?: Found}[];
  genres: {name: string; count: number; f?: Found}[];
  searches: string[];
  paging: Settings['paging'];
  grid: boolean;
  setGrid: (g: boolean) => void;
  cover: (f: Found) => string | null;
  wantCovers: (l: Found[]) => void;
  onSearched: (q: string) => void;
  onForgetSearch: (q: string) => void;
  onOpen: (x: Snap) => void;
  onFound: (f: Found) => void;
  onGenre: (g: string) => void;
  onViewAll: (what: 'recent' | 'genres') => void;
  onLibrary: (l: Lib) => void;
  onAddLibrary: () => void;
}) {
  const {libs, index, ready, recent, genres, searches, paging, grid, setGrid, cover, wantCovers, onSearched, onForgetSearch, onOpen, onFound, onGenre, onViewAll, onAddLibrary} = props;
  const [q, setQ] = useState('');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState('all');
  const [rp, setRp] = useState(0);
  const [gp, setGp] = useState(0);
  const scroll = paging === 'scroll';

  const search = (
    <>
      <View style={[st.searchRow, {flexDirection: 'row', alignItems: 'center'}]}>
        <View style={[st.searchBox, {flex: 1}]}>
          <View style={{marginRight: px(10)}}><Icon name="search" size={px(26)} /></View>
          <TextInput
            style={st.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search titles"
            placeholderTextColor="#777777"
            returnKeyType="search"
            onSubmitEditing={() => onSearched(q)}
          />
          {q ? (
            <IconBtn bare name="close" label="Clear search" onPress={() => setQ('')} size={px(40)} />
          ) : null}
        </View>
        <Pressable onPress={() => setScopeOpen(!scopeOpen)} style={[st.filterBtn, (scopeOpen || scope !== 'all') && st.btnDark]} accessibilityLabel="Search filters">
          <Icon name="settings" size={px(28)} color={scopeOpen || scope !== 'all' ? '#ffffff' : BLACK} />
        </Pressable>
      </View>
      {scopeOpen ? (
        <Chips options={[{id: 'all', label: 'All libraries'}, ...libs.map(l => ({id: l.path, label: l.name}))]} value={scope} onChange={setScope} />
      ) : null}
    </>
  );

  // ----- searching -----
  if (q.trim()) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const title = (f: Found) => f.meta.title || f.book.fileTitle;
    const found = index
      .filter(f => scope === 'all' || f.lib.path === scope)
      .filter(f => words.every(w => title(f).toLowerCase().includes(w) || f.book.fileTitle.toLowerCase().includes(w)))
      .sort((a, b) => Number(!title(a).toLowerCase().startsWith(words[0])) - Number(!title(b).toLowerCase().startsWith(words[0])) || title(a).localeCompare(title(b)));
    wantCovers(found.slice(0, 24));
    return (
      <View style={{flex: 1}}>
        {search}
        <Toolbar text={!ready && !found.length ? 'Searching your libraries…' : `${found.length} title${found.length === 1 ? '' : 's'}`} grid={grid} setGrid={setGrid} />
        {found.length ? (
          <Collection
            key={q + scope + grid}
            grid={grid}
            top={px(64) + px(78) + (scopeOpen ? px(62) : 0) + px(60)}
            paging={paging}
            items={found.map(f => ({
              key: f.lib.path + f.book.key,
              title: title(f),
              sub: f.book.folder || f.lib.name,
              cover: cover(f),
              pills: f.meta.genres,
              onPress: () => {
                onSearched(q);
                onFound(f);
              },
            }))}
          />
        ) : ready ? (
          <Text style={[st.para, st.pad]}>No titles match. Try fewer words.</Text>
        ) : null}
      </View>
    );
  }

  // ----- browsing -----
  const head = (label: string, sub: string, page: number, pages: number, setPage: (n: number) => void, what: 'recent' | 'genres') => (
    <View style={st.secHead}>
      <Text style={st.secTitle}>
        {label}
        <Text style={st.secSub}>{` ${sub}`}</Text>
      </Text>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        {!scroll && pages > 1 ? (
          <>
            <IconBtn name="back" label="Previous" size={px(38)} disabled={page <= 0} onPress={() => setPage(page - 1)} style={{marginLeft: px(6)}} />
            <IconBtn name="forward" label="Next" size={px(38)} disabled={page >= pages - 1} onPress={() => setPage(page + 1)} style={{marginLeft: px(6)}} />
          </>
        ) : null}
        <IconBtn name="arrow-right" label="View all" size={px(38)} onPress={() => onViewAll(what)} style={{marginLeft: px(10)}} />
      </View>
    </View>
  );
  const row = (nodes: React.ReactNode[]) =>
    scroll ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: px(16)}}>{nodes}</ScrollView>
    ) : (
      <View style={{flexDirection: 'row', paddingHorizontal: px(16)}}>{nodes}</View>
    );

  const rPer = 4;
  const rw = Math.floor((W - px(32) - (rPer - 1) * px(14)) / rPer);
  const rPages = Math.max(1, Math.ceil(recent.length / rPer));
  const rpg = Math.min(rp, rPages - 1);
  const rShown = scroll ? recent : recent.slice(rpg * rPer, (rpg + 1) * rPer);
  const gPer = 5;
  const gw = Math.floor((W - px(32) - px(20) - (gPer - 1) * px(10)) / gPer);
  const gPages = Math.max(1, Math.ceil(genres.length / gPer));
  const gpg = Math.min(gp, gPages - 1);
  const gShown = scroll ? genres : genres.slice(gpg * gPer, (gpg + 1) * gPer);
  wantCovers([...rShown.map(r => r.f), ...gShown.map(g => g.f)].filter(Boolean) as Found[]);

  const body = (
    <>
      {!libs.length ? (
        <View style={[st.welcome, {marginHorizontal: px(16)}]}>
          <Text style={st.h2}>Welcome to InkShelf</Text>
          <Text style={[st.para, {fontSize: px(18)}]}>Pick a folder with your books (EPUB, PDF and more) and it becomes a library you can filter, search and bookmark.</Text>
          <Btn dark icon="folder-plus" label="Add your first library" onPress={onAddLibrary} />
        </View>
      ) : null}

      {searches.length ? (
        <View style={{paddingHorizontal: px(16)}}>
          <View style={st.secHead}>
            <Text style={st.secTitle}>Recent searches</Text>
            <IconBtn name="trash" label="Clear all searches" size={px(38)} onPress={() => onForgetSearch('')} />
          </View>
          <View style={[st.pillWrap, {maxHeight: px(84), overflow: 'hidden'}]}>
            {searches.map(t => (
              <View key={t} style={st.chip}>
                <Pressable onPress={() => setQ(t)} hitSlop={px(4)}>
                  <Text style={st.chipText}>{t}</Text>
                </Pressable>
                <Pressable onPress={() => onForgetSearch(t)} hitSlop={px(8)} accessibilityLabel={`Forget ${t}`} style={{marginLeft: px(8)}}>
                  <Icon name="close" size={px(16)} color="#555555" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {libs.length ? (
        <>
          <View style={{paddingHorizontal: px(16), marginTop: px(10)}}>{head('Recently', 'read', rpg, rPages, setRp, 'recent')}</View>
          {recent.length ? (
            row(
              rShown.map((r, i) => (
                <Pressable key={r.x.lib + r.x.key} onPress={() => onOpen(r.x)} style={{width: rw, marginLeft: i ? px(14) : 0}}>
                  <View>
                    <Card uri={(r.f && cover(r.f)) || r.x.cover} w={rw} title={r.x.title} />
                    {r.x.vol ? <View style={st.volBadge}><Text style={st.volBadgeText}>{`Vol ${r.x.vol}`}</Text></View> : null}
                  </View>
                  <Text style={st.cardTitle} numberOfLines={1}>{r.x.title}</Text>
                  <Text style={st.cardSub} numberOfLines={1}>{r.x.folder || r.x.libName}</Text>
                </Pressable>
              )),
            )
          ) : (
            <Text style={[st.small, {paddingHorizontal: px(16)}]}>Books you open will show up here.</Text>
          )}

          <View style={{paddingHorizontal: px(16), marginTop: px(16)}}>{head('Explore', 'by genre', gpg, gPages, setGp, 'genres')}</View>
          {genres.length ? (
            <View style={[st.genrePanel, {marginHorizontal: px(16)}]}>
              {(scroll ? [<ScrollView key="s" horizontal showsHorizontalScrollIndicator={false}><View style={{flexDirection: 'row'}}>{gTiles()}</View></ScrollView>] : [<View key="r" style={{flexDirection: 'row'}}>{gTiles()}</View>])}
            </View>
          ) : (
            <Text style={[st.small, {paddingHorizontal: px(16)}]}>{ready ? 'Add genres to your books and they will show up here.' : 'Looking through your libraries…'}</Text>
          )}
        </>
      ) : null}
    </>
  );
  function gTiles() {
    return gShown.map((g, i) => (
      <Pressable key={g.name} onPress={() => onGenre(g.name)} style={{width: gw, marginLeft: i ? px(10) : 0, alignItems: 'center'}}>
        <Cover uri={g.f ? cover(g.f) : null} w={gw} h={Math.round(gw * 1.45)} title={g.name} />
        <Text style={[st.cardTitle, {textAlign: 'center'}]} numberOfLines={1}>{g.name}</Text>
        <Text style={[st.cardSub, {textAlign: 'center'}]}>{`${g.count} book${g.count === 1 ? '' : 's'}`}</Text>
      </Pressable>
    ));
  }
  return (
    <View style={{flex: 1}}>
      {search}
      {scroll ? <ScrollView style={{flex: 1}}>{body}</ScrollView> : <View style={{flex: 1, overflow: 'hidden'}}>{body}</View>}
    </View>
  );
}

// ---------- folder browser ----------
/** The card a path lives on (its volume ID), so one card is never listed twice. */
export function cardId(p: string): string | null {
  const m = p.match(/^\/(?:storage|mnt\/media_rw)\/(?!emulated|self)([^/]+)/);
  return m ? m[1].toUpperCase() : null;
}

function FolderBrowser({path, onGo, onPick, onCancel, onBookPicker, knownRoots, title}: {path: string | null; onGo: (p: string | null) => void; onPick: (p: string) => void; onCancel: () => void; onBookPicker?: () => void; knownRoots: string[]; title?: string}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [roots, setRoots] = useState<{label: string; path: string}[]>([]);
  const [pg, setPg] = useState(1);
  useEffect(() => {
    setPg(1);
    (async () => {
      if (path) {
        log('list folder', path);
        setEntries((await listDir(path)).filter(e => e.isDir || /\.(epub|pdf|cbz|fb2|xps|mobi|txt|docx)$/i.test(e.name)));
      } else {
        const r = [{label: 'Supernote (internal storage)', path: '/storage/emulated/0'}];
        // SD cards: Android's storage APIs, plus places InkShelf already knows (libraries, picked books)
        const found = await storageRoots();
        log('storage roots', found.how, found.roots);
        // one row per card: the same card can be reported under several paths
        const byId = new Map<string, string>();
        for (const p of [...found.roots.filter(x => x.readable !== false).map(x => x.path), ...found.roots.map(x => x.path), ...knownRoots]) {
          const id = cardId(p);
          if (id && !byId.has(id)) byId.set(id, p);
        }
        const paths = Array.from(byId.values());
        paths.forEach((p, i) => r.push({label: `SD card${paths.length > 1 ? ' ' + (i + 1) : ''}`, path: p}));
        setRoots(r);
        setSearched(true);
      }
    })();
  }, [path]);
  const parent = path && path.split('/').length > 3 ? path.substring(0, path.lastIndexOf('/')) : null;
  const isRoot = path && roots.length && roots.some(r => r.path === path);
  const rowsPer = Math.floor((H - px(64) - px(170) - px(64)) / px(56));
  const list = entries || [];
  const pages = Math.max(1, Math.ceil(list.length / rowsPer));
  const shown = list.slice((pg - 1) * rowsPer, pg * rowsPer);
  return (
    <>
      <Header title={title || 'Add a library folder'} left="Cancel" onLeft={onCancel} />
      <View style={[st.pad, {flex: 1}]}>
        {!path ? (
          <>
            <Text style={st.para}>Where are your books?</Text>
            <Text style={st.small}>{'Tap ✓ to use a whole place as one library, or open it to choose a folder inside.'}</Text>
            {roots.map(r => (
              <View key={r.path} style={[st.folderRow, {flexDirection: 'row', alignItems: 'center'}]}>
                <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => onGo(r.path)} accessibilityLabel={`Open ${r.label}`}>
                  <Icon name="folder" size={px(28)} />
                  <Text style={[st.folderName, {flex: 1, marginLeft: px(12)}]}>{r.label}</Text>
                  <Icon name="forward" size={px(24)} />
                </Pressable>
                <IconBtn name="check" label={`Use all of ${r.label}`} dark onPress={() => onPick(r.path)} style={{marginLeft: px(14)}} />
              </View>
            ))}
            {searched && roots.length < 2 ? (
              <View style={[st.welcome, {marginTop: px(16)}]}>
                <Text style={[st.para, {fontSize: px(18), marginBottom: px(6)}]}>{"Can't see your SD card?"}</Text>
                <Text style={[st.small, {marginBottom: px(12)}]}>{'Pick any one book on the card with Supernote\'s file picker. InkShelf then remembers where the card is, and it shows up here with a ✓ from then on.'}</Text>
                {onBookPicker ? <Btn small dark icon="search" label="Find my SD card" onPress={onBookPicker} /> : null}
              </View>
            ) : onBookPicker ? (
              <Btn small icon="search" label="Or pick a book with Supernote's file picker" onPress={onBookPicker} style={{marginTop: px(20)}} />
            ) : null}
          </>
        ) : (
          <>
            <Text style={st.small} numberOfLines={2}>{path.replace('/storage/emulated/0', 'Supernote').replace(/^\/storage\/[^/]+/, 'SD card')}</Text>
            {entries ? <Text style={[st.small, {fontWeight: 'bold'}]}>{`${entries.filter(e => e.isDir).length} folders  ·  ${entries.filter(e => !e.isDir).length} books right here (subfolders are included too)`}</Text> : null}
            <View style={{flexDirection: 'row', marginVertical: px(10)}}>
              <Btn small icon="up" a11y="Up one folder" onPress={() => onGo(isRoot ? null : parent)} />
              <Btn small dark icon="check" label="Use this folder" onPress={() => onPick(path)} style={{marginLeft: px(10), flex: 1}} />
            </View>
            {entries === null ? <Text style={st.para}>Loading…</Text> : null}
            {entries && !entries.length ? <Text style={st.para}>This folder is empty.</Text> : null}
            {shown.map(e =>
              e.isDir ? (
                <View key={e.path} style={[st.folderRow, {flexDirection: 'row', alignItems: 'center'}]}>
                  <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => onGo(e.path)} accessibilityLabel={`Open ${e.name}`}>
                    <Icon name="folder" size={px(26)} />
                    <Text style={[st.folderName, {flex: 1, marginLeft: px(12)}]} numberOfLines={1}>{e.name}</Text>
                    <Icon name="forward" size={px(22)} />
                  </Pressable>
                  <IconBtn name="check" label={`Use ${e.name}`} onPress={() => onPick(e.path)} size={px(42)} style={{marginLeft: px(14)}} />
                </View>
              ) : (
                <View key={e.path} style={st.folderRow}>
                  <Text style={[st.small, {fontSize: px(17)}]} numberOfLines={1}>{e.name}</Text>
                </View>
              ),
            )}
          </>
        )}
      </View>
      {path && pages > 1 ? (
        <View style={st.pager}>
          <IconBtn name="back" label="Previous page" disabled={pg <= 1} onPress={() => setPg(pg - 1)} />
          <Text style={st.pageText}>{`${pg} / ${pages}`}</Text>
          <IconBtn name="forward" label="Next page" disabled={pg >= pages} onPress={() => setPg(pg + 1)} />
        </View>
      ) : null}
    </>
  );
}

// ---------- edit page ----------
function PillEditor({label, values, setValues, used, placeholder}: {label: string; values: string[]; setValues: (v: string[]) => void; used: string[]; placeholder: string}) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map(x => x.trim()).filter(x => x && !values.includes(x));
    if (parts.length) setValues([...values, ...parts]);
    setText('');
  };
  const suggestions = used.filter(t => !values.includes(t));
  return (
    <>
      <Text style={st.label}>{label}</Text>
      <View style={st.pillWrap}>
        {values.map(t => <Pill key={t} label={`${t}  ✕`} active onPress={() => setValues(values.filter(x => x !== t))} />)}
        {!values.length && <Text style={st.small}>None yet.</Text>}
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <TextInput style={[st.input, {flex: 1}]} value={text} onChangeText={setText} placeholder={placeholder} onSubmitEditing={add} />
        <IconBtn name="plus" label="Add" onPress={add} style={{marginLeft: px(8)}} />
      </View>
      {suggestions.length > 0 && (
        <>
          <Text style={st.small}>Tap to add one you've used before:</Text>
          <View style={st.pillWrap}>{suggestions.map(t => <Pill key={t} label={`+ ${t}`} onPress={() => setValues([...values, t])} />)}</View>
        </>
      )}
    </>
  );
}

function EditPage({book, meta, allGenres, allTags, allCats, cover, onSave, onCancel, onPickCover, onSplit}: {
  book: Book;
  meta: Meta;
  allGenres: string[];
  allTags: string[];
  allCats: string[];
  cover: string | null;
  onSave: (m: Meta) => void;
  onCancel: () => void;
  onPickCover: () => Promise<string | null>;
  onSplit?: () => void;
}) {
  const [title, setTitle] = useState(meta.title || book.fileTitle);
  const fromFolders = folderCats(book);
  const [cats, setCats] = useState<string[]>(catsOf(book, meta));
  const [genres, setGenres] = useState<string[]>(meta.genres || []);
  const [tags, setTags] = useState<string[]>(meta.tags || []);
  const [desc, setDesc] = useState(meta.description || '');
  const [img, setImg] = useState<string | undefined>(meta.cover);
  const [language, setLanguage] = useState(meta.language || '');
  const [status, setStatus] = useState(meta.status || '');
  const [translated, setTranslated] = useState<Meta['translated']>(meta.translated);
  const guess = (book.folder.match(/^(\w+)\s+novels?$/i) || [])[1];
  const langs = Array.from(new Set([guess, 'Chinese', 'Korean', 'Japanese', 'English'].filter(Boolean) as string[])).filter(l => l !== language);
  const result = (): Meta => ({
    title: title.trim() && title.trim() !== book.fileTitle ? title.trim() : undefined,
    genres,
    tags,
    description: desc.trim() || undefined,
    cover: img,
    language: language.trim() || undefined,
    status: status.trim() || undefined,
    translated,
    categories: JSON.stringify(cats) === JSON.stringify(fromFolders) ? undefined : cats,
  });
  const start = useRef(JSON.stringify(result()));
  const dirty = JSON.stringify(result()) !== start.current;
  const [ask, setAsk] = useState(false);
  // leaving with changes: ask whether to keep them
  const leave = () => (dirty ? setAsk(true) : onCancel());
  return (
    <ModalCard onOutside={leave}>
      <CardHeader title="Edit details" onBack={leave} onClose={leave} />
      <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
        <Text style={st.label}>Title</Text>
        <TextInput style={st.input} value={title} onChangeText={setTitle} />
        <Text style={st.small}>{`File name: ${book.fileTitle}`}</Text>

        <PillEditor label="Category" values={cats} setValues={setCats} used={allCats} placeholder="Type a new category, then +" />
        {fromFolders.length ? <Text style={st.small}>{`From its folders: ${fromFolders.join(' › ')}`}</Text> : null}
        <PillEditor label="Genre" values={genres} setValues={setGenres} used={allGenres} placeholder="e.g. Romance, Drama" />
        <PillEditor label="Tags" values={tags} setValues={setTags} used={allTags} placeholder="e.g. Slow Romance, First Love" />

        <Text style={st.label}>Description</Text>
        <TextInput style={[st.input, {minHeight: px(180), textAlignVertical: 'top'}]} value={desc} onChangeText={setDesc} multiline placeholder="What's this book about?" />

        <Text style={st.label}>Language</Text>
        <TextInput style={st.input} value={language} onChangeText={setLanguage} placeholder="The language it was first written in" />
        <View style={st.pillWrap}>{langs.map(l => <Pill key={l} label={l} onPress={() => setLanguage(l)} />)}</View>

        <Text style={st.label}>Status</Text>
        <TextInput style={st.input} value={status} onChangeText={setStatus} placeholder="e.g. 94 Chapters + 6 Extras (Completed)" />

        <Text style={st.label}>Completely translated</Text>
        <View style={st.pillWrap}>
          {(['Yes', 'No'] as const).map(v => <Pill key={v} label={v} active={translated === v} onPress={() => setTranslated(translated === v ? undefined : v)} />)}
        </View>

        <Text style={st.label}>Cover</Text>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Cover uri={img || cover} w={px(100)} h={px(150)} title={title} />
          <View style={{flex: 1, marginLeft: px(14)}}>
            <Btn small icon="image" label="Choose an image" onPress={async () => {
              const p = await onPickCover();
              if (p) setImg(p);
            }} />
            <Text style={[st.small, {marginTop: px(6)}]}>{'Opens your screenshots. Take a screenshot of any cover, then pick it here.'}</Text>
            {img ? <Btn small label="Use the book's own cover" onPress={() => setImg(undefined)} style={{marginTop: px(8)}} /> : null}
          </View>
        </View>

        <Btn
          dark
          icon="check"
          a11y="Save"
          onPress={() => onSave(result())}
          style={{marginTop: px(24)}}
        />
        {onSplit ? (
          <View style={[st.missingNote, {marginTop: px(24)}]}>
            <Text style={[st.small, {color: BLACK, fontWeight: 'bold'}]}>{`One book made of ${book.files.length} files`}</Text>
            <Text style={st.small}>{book.series === 'group' ? 'You combined these files.' : 'InkShelf combined these because they share a folder named after them.'}</Text>
            <Btn small icon="split" label="Split into separate books" onPress={onSplit} style={{marginTop: px(8)}} />
          </View>
        ) : null}
        <View style={{height: px(200)}} />
      </ScrollView>
      {ask ? (
        <View style={st.overlay}>
          <View style={st.dialog}>
            <Text style={[st.h2, {marginBottom: px(6)}]}>Save your changes?</Text>
            <Text style={[st.para, {fontSize: px(18)}]}>{`You changed the details of "${title || book.fileTitle}".`}</Text>
            <Btn dark icon="check" label="Save" onPress={() => onSave(result())} />
            <Btn icon="trash" label="Discard changes" onPress={onCancel} style={{marginTop: px(10)}} />
            <Btn small label="Keep editing" onPress={() => setAsk(false)} style={{marginTop: px(10)}} />
          </View>
        </View>
      ) : null}
    </ModalCard>
  );
}

// ---------- a page that opens over the one behind it (tap outside to close) ----------
const CARD_X = px(26);
const CARD_Y = px(30);
const CARD_W = W - CARD_X * 2;
const CARD_H = H - CARD_Y * 2;
function ModalCard({onOutside, children}: {onOutside: () => void; children: React.ReactNode}) {
  return (
    <View style={st.cardWrap}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onOutside} accessibilityLabel="Outside the page" />
      <View style={st.pageCard}>{children}</View>
    </View>
  );
}
function CardHeader({title, onBack, onClose, right}: {title: string; onBack: () => void; onClose: () => void; right?: React.ReactNode}) {
  return (
    <View style={st.header}>
      <IconBtn bare name="back" label="Back" onPress={onBack} iconSize={px(30)} />
      <Text style={st.headerTitle} numberOfLines={1}>{title}</Text>
      {right}
      <IconBtn bare name="close" label="Close page" onPress={onClose} iconSize={px(30)} />
    </View>
  );
}

const st = StyleSheet.create({
  statusChip: {flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BLACK, borderRadius: px(22), height: px(44), paddingHorizontal: px(12), marginLeft: px(10)},
  statusText: {fontSize: px(17), fontWeight: 'bold', color: BLACK, flexShrink: 1},
  statusPick: {flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BLACK, borderRadius: px(24), height: px(50), paddingHorizontal: px(16), marginRight: px(10), marginBottom: px(10)},
  histRow: {flexDirection: 'row', alignItems: 'center', height: px(40), borderBottomWidth: 1, borderColor: '#dddddd'},
  colChips: {flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: px(12), paddingTop: px(10), height: px(120), overflow: 'hidden', borderBottomWidth: 1, borderColor: '#888888'},
  ruleRow: {flexDirection: 'row', alignItems: 'center', marginBottom: px(8)},
  ruleBit: {flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BLACK, borderRadius: px(10), height: px(46), paddingHorizontal: px(10), marginRight: px(6)},
  ruleText: {fontSize: px(17), fontWeight: 'bold', color: BLACK, marginRight: px(4), flexShrink: 1},
  permRow: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(12), padding: px(12), marginTop: px(10)},
  permState: {borderWidth: 1.5, borderColor: BLACK, borderRadius: px(14), paddingHorizontal: px(10), paddingVertical: px(4), marginLeft: px(8)},
  helpSearch: {flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BLACK, borderRadius: px(28), height: px(56), paddingHorizontal: px(16)},
  helpInput: {flex: 1, fontSize: px(19), color: BLACK, marginLeft: px(10)},
  helpStep: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: px(16)},
  helpNum: {width: px(34), height: px(34), borderRadius: px(17), backgroundColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: px(14), marginTop: px(2)},
  helpNumText: {color: '#ffffff', fontWeight: 'bold', fontSize: px(17)},
  cardWrap: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)', paddingHorizontal: CARD_X, paddingVertical: CARD_Y},
  pageCard: {flex: 1, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: BLACK, borderRadius: px(20), overflow: 'hidden'},
  screen: {flex: 1, backgroundColor: '#ffffff'},
  pad: {padding: px(16)},
  header: {height: px(64), flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderColor: BLACK, paddingHorizontal: px(12)},
  headerBtn: {paddingVertical: px(8), paddingHorizontal: px(6)},
  headerBtnText: {fontSize: px(20), color: BLACK},
  headerTitle: {flex: 1, textAlign: 'center', fontSize: px(22), fontWeight: 'bold', color: BLACK},
  h1: {fontSize: px(28), fontWeight: 'bold', color: BLACK, marginBottom: px(14)},
  h2: {fontSize: px(24), fontWeight: 'bold', color: BLACK, marginTop: px(18), marginBottom: px(10)},
  para: {fontSize: px(20), lineHeight: px(30), color: BLACK, marginBottom: px(12)},
  small: {fontSize: px(15), color: '#333333'},
  warn: {fontSize: px(18), color: BLACK, borderWidth: 2, borderColor: BLACK, padding: px(12), marginBottom: px(12)},
  label: {fontSize: px(19), fontWeight: 'bold', color: BLACK, marginTop: px(18), marginBottom: px(6)},
  input: {borderWidth: 2, borderColor: BLACK, borderRadius: px(8), fontSize: px(19), color: BLACK, paddingHorizontal: px(10), paddingVertical: px(8), marginBottom: px(6)},
  btn: {borderWidth: 2, borderColor: BLACK, borderRadius: px(12), paddingVertical: px(14), paddingHorizontal: px(16), alignItems: 'center'},
  btnSmall: {paddingVertical: px(8), paddingHorizontal: px(12), borderRadius: px(10)},
  btnDark: {backgroundColor: BLACK},
  btnText: {fontSize: px(21), fontWeight: 'bold', color: BLACK},
  btnTextSmall: {fontSize: px(17)},
  libRow: {flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BLACK, borderRadius: px(10), padding: px(14), marginBottom: px(12)},
  libName: {fontSize: px(24), fontWeight: 'bold', color: BLACK},
  folderRow: {borderBottomWidth: 1, borderColor: '#888888', height: px(56), justifyContent: 'center'},
  folderName: {fontSize: px(20), color: BLACK},
  side: {borderRightWidth: 2, borderColor: BLACK},
  sideHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: px(4)},
  sideTitle: {fontSize: px(22), fontWeight: 'bold', color: BLACK},
  clear: {fontSize: px(17), color: BLACK, textDecorationLine: 'underline'},
  section: {fontSize: px(18), fontWeight: 'bold', color: BLACK, marginTop: px(10), marginBottom: px(4), borderBottomWidth: 1, borderColor: '#888888', paddingBottom: px(3)},
  hint: {fontSize: px(13), color: '#444444', marginBottom: px(6)},
  modeRow: {flexDirection: 'row', alignItems: 'center', marginBottom: px(4)},
  fRow: {flexDirection: 'row', alignItems: 'center', height: px(40)},
  box: {width: px(24), height: px(24), borderWidth: 2, borderColor: BLACK, borderRadius: px(4), alignItems: 'center', justifyContent: 'center', marginRight: px(8)},
  boxMark: {fontSize: px(16), lineHeight: px(20), fontWeight: 'bold', color: BLACK},
  fLabel: {flex: 1, fontSize: px(17), color: BLACK},
  fCount: {fontSize: px(15), color: '#444444', marginLeft: px(4)},
  gPager: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: px(56), borderTopWidth: 1, borderColor: '#888888'},
  arrow: {width: px(64), height: px(44), borderWidth: 2, borderColor: BLACK, borderRadius: px(22), alignItems: 'center', justifyContent: 'center'},
  arrowText: {fontSize: px(30), lineHeight: px(34), color: BLACK, fontWeight: 'bold'},
  iconBtn: {width: px(48), height: px(42), borderWidth: 2, borderColor: BLACK, borderRadius: px(8), alignItems: 'center', justifyContent: 'center', marginLeft: px(8)},
  resBar: {height: px(58), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: px(10), paddingTop: px(8)},
  resCount: {fontSize: px(19), fontWeight: 'bold', color: BLACK},
  pillWrap: {flexDirection: 'row', flexWrap: 'wrap', marginVertical: px(4)},
  pillLine: {flexDirection: 'row', flexWrap: 'nowrap', overflow: 'hidden', marginTop: px(4), marginBottom: px(2), height: px(28)},
  pill: {borderWidth: 1.5, borderColor: BLACK, borderRadius: px(30), paddingHorizontal: px(10), paddingVertical: px(2), marginRight: px(6), marginBottom: px(6)},
  pillSmall: {paddingHorizontal: px(8), paddingVertical: px(1), marginRight: px(5), marginBottom: px(5)},
  pillActive: {backgroundColor: BLACK},
  pillText: {fontSize: px(15), color: BLACK},
  row: {flexDirection: 'row', borderBottomWidth: 1, borderColor: '#888888', paddingVertical: px(7), overflow: 'hidden'},
  rowText: {flex: 1, marginLeft: px(12), overflow: 'hidden'},
  rowTitle: {fontSize: px(18), lineHeight: px(22), fontWeight: 'bold', color: BLACK},
  teaser: {fontSize: px(15), color: '#222222', lineHeight: px(19)},
  gridCell: {flex: 1, alignItems: 'center', paddingTop: px(6)},
  gridTitle: {fontSize: px(14), fontWeight: 'bold', color: BLACK, textAlign: 'center', marginTop: px(4), paddingHorizontal: px(4)},
  pager: {height: px(64), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 2, borderColor: BLACK, paddingHorizontal: px(12)},
  pageBtn: {borderWidth: 2, borderColor: BLACK, borderRadius: px(30), paddingHorizontal: px(20), paddingVertical: px(8)},
  pageBtnText: {fontSize: px(19), color: BLACK},
  pageText: {fontSize: px(19), color: BLACK},
  dim: {opacity: 0.3},
  noCover: {borderWidth: 1.5, borderColor: BLACK, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', padding: px(4)},
  noCoverText: {color: BLACK, textAlign: 'center', fontWeight: 'bold'},
  bookTitle: {fontSize: px(26), lineHeight: px(34), fontWeight: 'bold', color: BLACK},
  bookLeft: {borderRightWidth: 1.5, borderColor: '#888888'},
  startBtn: {height: px(48), flexDirection: 'row', backgroundColor: BLACK, borderRadius: px(10), alignItems: 'center', justifyContent: 'center'},
  startText: {fontSize: px(18), fontWeight: 'bold', color: '#ffffff'},
  editBtn: {borderWidth: 1.5, borderColor: BLACK, borderRadius: px(20), paddingHorizontal: px(14), paddingVertical: px(5)},
  editText: {fontSize: px(17), color: BLACK},
  infoLabel: {fontSize: px(18), fontWeight: 'bold', color: BLACK, marginTop: px(4)},
  infoValue: {fontSize: px(17), lineHeight: px(24), color: BLACK},
  taskbar: {height: TASK_H, flexDirection: 'row', borderTopWidth: 2, borderColor: BLACK, backgroundColor: '#ffffff', overflow: 'visible'},
  // a half circle cut down into the bar (only its lower half shows), with the button sitting in it
  notchClip: {position: 'absolute', top: -2, alignSelf: 'center', width: px(102), height: px(51) + 2, overflow: 'hidden'},
  notch: {position: 'absolute', top: -px(51) + 1, left: 0, width: px(102), height: px(102), borderRadius: px(51), borderWidth: 2, borderColor: BLACK, backgroundColor: '#ffffff'},
  taskCta: {position: 'absolute', top: -px(35) - 1, alignSelf: 'center', width: px(70), height: px(70), borderRadius: px(35), borderWidth: px(5), borderColor: BLACK, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center'},
  taskLabel: {position: 'absolute', bottom: px(6), fontSize: px(14), color: '#555555'},
  taskLabelOn: {fontWeight: 'bold', fontSize: px(15), color: BLACK},
  task: {flex: 1, alignItems: 'center', justifyContent: 'flex-start'},
  taskIcon: {width: px(64), height: px(48), borderRadius: px(24), alignItems: 'center', justifyContent: 'center'},
  taskText: {fontSize: px(13), color: BLACK, marginTop: px(1)},
  dropWrap: {position: 'absolute', left: 0, right: 0, top: px(64), bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 20},
  drop: {backgroundColor: '#ffffff', borderBottomWidth: 2, borderColor: BLACK, borderBottomLeftRadius: px(18), borderBottomRightRadius: px(18), padding: px(12)},
  ruleOpen: {borderWidth: 3},
  ruleDrop: {backgroundColor: '#ffffff', borderWidth: 2, borderColor: BLACK, borderRadius: px(16), padding: px(6), paddingBottom: px(10)},
  editBar: {flexDirection: 'row', alignItems: 'center', height: px(58), paddingHorizontal: px(16), borderBottomWidth: 1, borderColor: '#888888', backgroundColor: '#f2f2f2'},
  colTile: {borderWidth: 2, borderColor: BLACK, borderRadius: px(16), padding: px(8), overflow: 'hidden'},
  toast: {position: 'absolute', left: px(24), right: px(24), bottom: TASK_H + px(34), backgroundColor: BLACK, borderRadius: px(14), paddingVertical: px(12), paddingHorizontal: px(18)},
  toastText: {color: '#ffffff', fontSize: px(17), textAlign: 'center'},
  triRow: {flexDirection: 'row', alignItems: 'center', height: px(50), borderBottomWidth: 1, borderColor: '#dddddd'},
  triBox: {width: px(30), height: px(30), borderWidth: 2, borderColor: BLACK, borderRadius: px(7), alignItems: 'center', justifyContent: 'center', marginRight: px(14)},
  triLabel: {flex: 1, fontSize: px(19), color: BLACK},
  sheetTabs: {flexDirection: 'row', borderBottomWidth: 2, borderColor: BLACK},
  sheetTab: {flex: 1, alignItems: 'center', paddingVertical: px(10), borderBottomWidth: 4, borderColor: 'transparent', marginBottom: -2},
  sheetTabOn: {borderColor: BLACK},
  sheetTabText: {fontSize: px(18), color: BLACK},
  catRow: {flexDirection: 'row', alignItems: 'center', height: px(48), borderRadius: px(10), paddingRight: px(12), marginBottom: px(4)},
  catName: {flex: 1, fontSize: px(20), fontWeight: 'bold', color: BLACK},
  dataHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: px(10)},
  dataTitle: {fontSize: px(22), fontWeight: 'bold', color: BLACK},
  dChoice: {flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5, borderColor: '#999999', borderRadius: px(12), padding: px(12), marginBottom: px(8)},
  dChoiceOn: {borderColor: BLACK, borderWidth: 2.5},
  choiceTitle: {fontSize: px(19), fontWeight: 'bold', color: BLACK, marginBottom: px(2)},
  dRadio: {width: px(24), height: px(24), borderRadius: px(12), borderWidth: 2, borderColor: BLACK, marginRight: px(12), marginTop: px(2)},
  dRadioOn: {borderWidth: px(8)},
  missingNote: {borderWidth: 2, borderStyle: 'dashed', borderColor: BLACK, borderRadius: px(10), padding: px(10)},
  crumbBar: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(10), height: px(62), borderBottomWidth: 1, borderColor: '#888888'},
  nameBar: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(10), height: px(70), borderBottomWidth: 1, borderColor: '#888888'},
  sheetWrap: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)'},
  sheet: {backgroundColor: '#ffffff', borderTopLeftRadius: px(28), borderTopRightRadius: px(28), borderWidth: 2, borderBottomWidth: 0, borderColor: BLACK, paddingHorizontal: px(22), paddingTop: px(10), paddingBottom: px(26)},
  handle: {width: px(56), height: px(5), borderRadius: px(3), backgroundColor: '#999999', marginBottom: px(8)},
  sheetTitle: {fontSize: px(17), color: '#555555'},
  seg: {flexDirection: 'row', alignSelf: 'stretch', backgroundColor: '#ececec', borderRadius: px(30), padding: px(4), height: px(58)},
  segItem: {flex: 1, borderRadius: px(26), alignItems: 'center', justifyContent: 'center'},
  segOn: {backgroundColor: '#ffffff', borderWidth: 2, borderColor: BLACK},
  segText: {fontSize: px(17), color: BLACK},
  tile: {alignSelf: 'stretch', backgroundColor: '#ececec', borderRadius: px(22), padding: px(10)},
  tileLabel: {fontSize: px(14), color: '#555555', marginTop: px(6), textAlign: 'center'},
  round: {width: px(66), height: px(66), borderRadius: px(33), backgroundColor: '#ececec', alignItems: 'center', justifyContent: 'center'},
  roundText: {fontSize: px(28), color: BLACK},
  searchRow: {paddingHorizontal: px(16), paddingTop: px(14), paddingBottom: px(10)},
  searchBox: {height: px(54), flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BLACK, borderRadius: px(27), paddingHorizontal: px(16)},
  searchGlyph: {fontSize: px(24), color: BLACK, marginRight: px(8)},
  searchInput: {flex: 1, fontSize: px(19), color: BLACK, paddingVertical: 0},
  searchClear: {fontSize: px(20), color: BLACK, paddingHorizontal: px(6)},
  welcome: {borderWidth: 2, borderColor: BLACK, borderRadius: px(16), padding: px(18), marginTop: px(6)},
  homeLabel: {fontSize: px(19), fontWeight: 'bold', color: BLACK, marginBottom: px(8)},
  chip: {flexDirection: 'row', alignItems: 'center', backgroundColor: '#ececec', borderRadius: px(18), paddingLeft: px(14), paddingRight: px(10), height: px(34), marginRight: px(8), marginBottom: px(6)},
  chipText: {fontSize: px(16), color: BLACK},
  chipX: {fontSize: px(14), color: '#555555', marginLeft: px(10)},
  volBadge: {position: 'absolute', left: px(4), bottom: px(4), backgroundColor: BLACK, borderRadius: px(6), paddingHorizontal: px(6), paddingVertical: px(1)},
  volBadgeText: {fontSize: px(12), color: '#ffffff', fontWeight: 'bold'},
  libChip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(12), paddingHorizontal: px(14), height: px(48), marginRight: px(10), marginBottom: px(10)},
  libChipText: {fontSize: px(18), color: BLACK, marginLeft: px(8)},
  taskHome: {width: px(76), height: px(50), borderRadius: px(25), borderWidth: 1.5, borderColor: BLACK},
  badge: {position: 'absolute', top: -px(4), right: -px(2), minWidth: px(20), height: px(20), borderRadius: px(10), backgroundColor: BLACK, borderWidth: 1.5, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: px(4)},
  badgeText: {fontSize: px(11), fontWeight: 'bold', color: '#ffffff'},
  chipsRow: {flexDirection: 'row', flexWrap: 'nowrap', overflow: 'hidden', paddingHorizontal: px(16), paddingVertical: px(12)},
  fchip: {borderWidth: 1.5, borderColor: '#bbbbbb', borderRadius: px(20), paddingHorizontal: px(16), height: px(38), justifyContent: 'center', marginRight: px(8), backgroundColor: '#f4f4f4'},
  fchipText: {fontSize: px(16), color: BLACK},
  card: {backgroundColor: '#efefef', borderRadius: px(14), padding: px(8), borderWidth: 1, borderColor: '#dddddd'},
  cardTitle: {fontSize: px(16), fontWeight: 'bold', color: BLACK, marginTop: px(6)},
  cardSub: {fontSize: px(13), color: '#666666', marginTop: px(1)},
  filterBtn: {width: px(54), height: px(54), borderRadius: px(27), borderWidth: 2, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginLeft: px(10)},
  secHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: px(40)},
  secTitle: {fontSize: px(20), fontWeight: 'bold', color: BLACK},
  secSub: {fontWeight: 'normal', color: '#777777'},
  viewAll: {fontSize: px(16), color: '#444444', textDecorationLine: 'underline', marginLeft: px(12)},
  miniArrow: {width: px(38), height: px(32), borderRadius: px(16), borderWidth: 1.5, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginLeft: px(6)},
  miniArrowText: {fontSize: px(22), lineHeight: px(26), fontWeight: 'bold', color: BLACK},
  genrePanel: {backgroundColor: '#f2f2f2', borderRadius: px(18), padding: px(10), borderWidth: 1, borderColor: '#dddddd'},
  postit: {borderWidth: 1, borderColor: '#555555', alignItems: 'center', justifyContent: 'center', transform: [{rotate: '-5deg'}]},
  postitFold: {position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderLeftWidth: px(12), borderTopWidth: px(12), borderLeftColor: 'transparent', borderTopColor: '#999999'},
  postitNum: {fontSize: px(20), lineHeight: px(22), fontWeight: 'bold', color: BLACK},
  postitLabel: {fontSize: px(11), color: BLACK},
  board: {alignSelf: 'center', marginTop: px(10), backgroundColor: '#e9e4d8', borderRadius: px(14), borderWidth: 1.5, borderColor: '#9a917f', padding: px(6)},
  boardSlot: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  sticky: {padding: px(14), paddingTop: px(20), borderWidth: 1, borderColor: '#6d6658', borderRadius: px(3), shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: {width: 2, height: 3}, elevation: 3},
  stickyNew: {borderWidth: 2, borderStyle: 'dashed', borderColor: '#6d6658', borderRadius: px(6), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.5)'},
  stickyTitle: {fontSize: px(19), fontWeight: 'bold', color: BLACK, marginBottom: px(4)},
  stickyText: {fontSize: px(17), lineHeight: px(25), color: BLACK},
  stickyDate: {position: 'absolute', right: px(10), bottom: px(6), fontSize: px(12), color: '#333333'},
  pin: {position: 'absolute', top: px(5), alignSelf: 'center', left: '50%', marginLeft: -px(7), width: px(14), height: px(14), borderRadius: px(7), backgroundColor: '#3a3a3a'},
  pickMark: {position: 'absolute', right: px(8), top: px(8), width: px(34), height: px(34), borderRadius: px(17), borderWidth: 2.5, borderColor: BLACK, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center'},
  boardBar: {height: px(96), flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  modalWrap: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center'},
  modal: {width: W - px(60), backgroundColor: '#ffffff', borderRadius: px(22), borderWidth: 2, borderColor: BLACK, padding: px(18)},
  modalHead: {flexDirection: 'row', alignItems: 'center', marginBottom: px(14)},
  modalTitle: {fontSize: px(22), fontWeight: 'bold', color: BLACK},
  noteTab: {flex: 1, height: px(44), borderWidth: 1.5, borderColor: '#777777', borderRadius: px(6), alignItems: 'center', justifyContent: 'center', marginRight: px(6), paddingHorizontal: px(4)},
  noteTabOn: {borderWidth: 3, borderColor: BLACK},
  noteTabText: {fontSize: px(14), color: BLACK, fontWeight: 'bold'},
  noteBig: {borderWidth: 1, borderColor: '#555555', padding: px(18), borderRadius: px(4)},
  noteTitle: {fontSize: px(21), fontWeight: 'bold', color: BLACK, marginBottom: px(8)},
  noteText: {fontSize: px(19), lineHeight: px(28), color: BLACK},
  noteTitleInput: {fontSize: px(20), fontWeight: 'bold', color: BLACK, borderBottomWidth: 1.5, borderColor: '#555555', paddingVertical: px(6), marginBottom: px(8)},
  noteTextInput: {flex: 1, fontSize: px(19), lineHeight: px(28), color: BLACK, textAlignVertical: 'top'},
  swatch: {width: px(42), height: px(42), borderRadius: px(21), borderWidth: 1.5, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  iconRing: {borderWidth: 1.5, borderColor: BLACK, backgroundColor: '#ffffff'},
  headerName: {fontSize: px(22), fontWeight: 'bold', color: BLACK, marginRight: px(4), maxWidth: W - px(300)},
  markBadge: {position: 'absolute', right: px(6), top: px(6), backgroundColor: BLACK, borderRadius: px(6), paddingHorizontal: px(6), paddingVertical: px(2)},
  noteTabPlus: {flexGrow: 0, flexShrink: 0, flexBasis: px(52), width: px(52), borderStyle: 'dashed', backgroundColor: '#ffffff', marginRight: 0},
  brand: {position: 'absolute', top: 0, left: 0, right: 0, height: px(64), flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  brandText: {fontSize: px(24), fontWeight: 'bold', color: BLACK, marginLeft: px(10)},
  newBadge: {position: 'absolute', left: 0, top: px(6), backgroundColor: BLACK, paddingHorizontal: px(6), paddingVertical: px(1), borderTopRightRadius: px(6), borderBottomRightRadius: px(6)},
  newBadgeText: {fontSize: px(11), fontWeight: 'bold', color: '#ffffff', letterSpacing: 1},
  libCard: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(14), padding: px(12), marginBottom: px(12)},
  libIcon: {width: px(56), height: px(56), borderRadius: px(12), backgroundColor: '#ececec', alignItems: 'center', justifyContent: 'center', marginRight: px(14)},
  toolbar: {height: px(60), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: px(16)},
  pagerName: {fontSize: px(15), fontWeight: 'bold', color: BLACK},
  colHead: {fontSize: px(21), fontWeight: 'bold', color: BLACK},
  bodyText: {fontSize: px(18), lineHeight: px(27), color: BLACK},
  volHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: px(56)},
  volRow: {height: px(42), flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(8), paddingHorizontal: px(12)},
  volRowText: {fontSize: px(18), fontWeight: 'bold', color: BLACK, marginRight: px(10)},
  volName: {flex: 1, fontSize: px(17), color: BLACK},
  volCell: {height: px(74), borderWidth: 1.5, borderColor: BLACK, borderRadius: px(8), alignItems: 'center', justifyContent: 'center', paddingHorizontal: px(4)},
  volCellText: {fontSize: px(17), fontWeight: 'bold', color: BLACK},
  volCellSub: {fontSize: px(12), color: '#333333', marginTop: px(2), textAlign: 'center'},
  kindTabs: {flexDirection: 'row', marginTop: px(10), marginBottom: px(6)},
  kindTab: {flex: 1, borderWidth: 1.5, borderColor: BLACK, paddingVertical: px(5), alignItems: 'center', marginRight: px(4), borderRadius: px(6)},
  kindTabText: {fontSize: px(17), fontWeight: 'bold', color: BLACK},
  choice: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(10), padding: px(14), marginBottom: px(12)},
  radio: {width: px(24), height: px(24), borderRadius: px(12), borderWidth: 2, borderColor: BLACK, marginRight: px(14)},
  choiceText: {fontSize: px(20), fontWeight: 'bold', color: BLACK},
  overlay: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.88)', justifyContent: 'center', padding: px(40)},
  dialog: {backgroundColor: '#ffffff', borderWidth: 3, borderColor: BLACK, borderRadius: px(14), padding: px(24)},
});
