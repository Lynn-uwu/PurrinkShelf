/**
 * InkShelf - a library for the Supernote.
 * Pick any folder as a library; books are listed by file name; add titles, tags,
 * descriptions and covers on the device; filter by folder and tag; tap to read.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {FileUtils, PluginManager, RattaFileSelector as FileSelector} from 'sn-plugin-lib';
import {AppState, Book, DEFAULT_SETTINGS, EMPTY_STATE, Lib, MAX_NOTES, Meta, MetaStore, Note, NoteColor, Settings, Snap, Vol, needsDetails, coverFor, loadLibraries, loadMeta, loadSettings, loadState, saveLibraries, saveMeta, saveSettings, saveState, scanLibrary} from './src/library';
import {on} from './src/events';
import {ICONS, IconName} from './src/icons';
import {Entry, copyText, hasNative, listDir, openBook, pasteIntoNote} from './src/native';

const {width: W, height: H} = Dimensions.get('window');
const S = Math.min(W, H) / 702; // designed for a 702-wide screen, then scaled
const px = (n: number) => Math.round(n * S);
const BLACK = '#000000';
const LIST_PER_PAGE = 6;
const TASK_H = px(66);
const GRID_PER_PAGE = 12;
const READ = 'plugin.permission.FILE:READ';
const WRITE = 'plugin.permission.FILE:WRITE';

type Screen =
  | {kind: 'home'}
  | {kind: 'bookmarks'}
  | {kind: 'new'}
  | {kind: 'gallery'; what: 'recent' | 'genres'}
  | {kind: 'libraries'}
  | {kind: 'browse'; path: string | null}
  | {kind: 'library'}
  | {kind: 'book'; key: string; from?: From}
  | {kind: 'edit'; key: string; from?: From};
type From = 'home' | 'bookmarks' | 'library' | 'new';
/** one book anywhere in any library */
type Found = {lib: Lib; book: Book; meta: Meta};
type TagState = {[t: string]: 1 | -1}; // keys are "g:Genre" or "t:Tag"
type FilterKind = 'g' | 't';

async function askPermissions() {
  for (const p of [READ, WRITE]) {
    try {
      if (!(await PluginManager.hasPermission(p))) await PluginManager.requestPermission(p, 'InkShelf reads your book folders and saves your tags and descriptions.');
    } catch (e) {}
  }
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

function Cover({uri, w, h, title}: {uri?: string | null; w: number; h: number; title?: string}) {
  const [bad, setBad] = useState(false);
  if (!uri || bad) {
    return (
      <View style={[st.noCover, {width: w, height: h}]}>
        {title ? <Text style={[st.noCoverText, {fontSize: Math.max(px(9), Math.round(w / 9))}]} numberOfLines={5}>{title}</Text> : null}
      </View>
    );
  }
  return <Image source={{uri: /^[a-z]+:/i.test(uri) ? uri : 'file://' + uri}} style={{width: w, height: h}} resizeMode="cover" onError={() => setBad(true)} />;
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

function Header({left, title, onLeft, right}: {left?: string; title: string; onLeft?: () => void; right?: React.ReactNode}) {
  return (
    <View style={st.header}>
      <View style={{minWidth: px(110), flexDirection: 'row'}}>
        {left && onLeft ? <IconBtn bare name="back" label={left} onPress={onLeft} iconSize={px(30)} /> : null}
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
export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
  const [app, setApp] = useState<AppState>(EMPTY_STATE);
  const [showSettings, setShowSettings] = useState(false);
  const [libs, setLibs] = useState<Lib[]>([]);
  const [lib, setLib] = useState<Lib | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [meta, setMeta] = useState<MetaStore>({version: 1, books: {}});
  const [covers, setCovers] = useState<{[k: string]: string | null}>({});
  const coverCache = useRef<{[k: string]: string | null}>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // filters
  const [folders, setFolders] = useState<string[]>([]);
  const [tags, setTags] = useState<TagState>({});
  const [mode, setMode] = useState<'all' | 'any'>('all');
  const [page, setPage] = useState(1);
  const [tPage, setTPage] = useState(1);
  const [fKind, setFKind] = useState<FilterKind>('g');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const changeSettings = (patch: Partial<Settings>) => {
    setSettings(cur => {
      const n = {...cur, ...patch};
      saveSettings(n);
      return n;
    });
  };
  const grid = settings.libraryGrid;
  const setGrid = (v: boolean) => changeSettings({libraryGrid: v});
  const showFilters = settings.showFilters;
  const setShowFilters = (v: boolean) => changeSettings({showFilters: v});
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

  useEffect(() => {
    (async () => {
      await askPermissions();
      loadSettings().then(setSettings);
      loadState().then(setApp);
      const l = await loadLibraries();
      setLibs(l);
    })();
    // Supernote's own settings entry for InkShelf opens the settings sheet
    return on('settings', () => setShowSettings(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metaOf = (b: Book): Meta => meta.books[b.key] || {};
  const titleOf = (b: Book) => metaOf(b).title || b.fileTitle;

  async function openLibrary(l: Lib, then?: Screen, filter?: TagState) {
    setBusy(`Reading ${l.name}…`);
    setLib(l);
    coverCache.current = {};
    setCovers({});
    setFolders([]);
    setTags({});
    setPage(1);
    const [bs, m] = await Promise.all([scanLibrary(l.path), loadMeta(l.path)]);
    setBooks(bs);
    setMeta(m);
    setLibData(d => ({...d, [l.path]: {books: bs, meta: m}}));
    if (filter) {
      setTags(filter);
      setFKind('g');
    }
    setBusy(null);
    setScreen(then || {kind: 'library'});
    changeApp(a => ({...a, lastLib: l.path}));
  }

  // ---------- every library at once (Home, search, Newly added, genres) ----------
  const [libData, setLibData] = useState<{[path: string]: {books: Book[]; meta: MetaStore}}>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const l of libs) {
        if (libData[l.path]) continue;
        const [bs, m] = await Promise.all([scanLibrary(l.path), loadMeta(l.path)]);
        if (!alive) return;
        setLibData(d => ({...d, [l.path]: {books: bs, meta: m}}));
      }
    })();
    return () => {
      alive = false;
    };
  }, [libs]); // eslint-disable-line react-hooks/exhaustive-deps
  const index: Found[] = useMemo(
    () =>
      libs.flatMap(l => {
        const d = l.path === lib?.path && books.length ? {books, meta} : libData[l.path];
        return d ? d.books.map(b => ({lib: l, book: b, meta: d.meta.books[b.key] || {}})) : [];
      }),
    [libs, lib, books, meta, libData],
  );
  const indexReady = libs.every(l => libData[l.path] || (l.path === lib?.path && books.length));
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
  const fresh = useMemo(() => index.filter(f => needsDetails(f.meta)).sort((a, b) => b.book.added - a.book.added), [index]);
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
      setFolders([]);
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
  const rememberSearch = (q: string) => {
    const t = q.trim();
    if (t) changeApp(a => ({...a, searches: [t, ...a.searches.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 6)}));
  };

  async function updateMeta(key: string, patch: Meta) {
    if (!lib) return;
    const next: MetaStore = {...meta, books: {...meta.books, [key]: {...meta.books[key], ...patch}}};
    setMeta(next);
    const ok = await saveMeta(lib.path, next);
    if (!ok) setMessage("Couldn't save to the library folder. Check InkShelf is allowed to write files (Settings › Apps › Plugins).");
  }

  async function read(path: string) {
    setBusy('Opening…');
    const err = await openBook(path, 'reader');
    setBusy(null);
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

  // ---------- filtering ----------
  const allFolders = useMemo(() => Array.from(new Set(books.map(b => b.folder))).sort(), [books]);
  const namesOf = (field: 'genres' | 'tags') =>
    Array.from(new Set(books.flatMap(b => meta.books[b.key]?.[field] || []))).sort((a, b) => a.localeCompare(b));
  const allGenres = useMemo(() => namesOf('genres'), [books, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const allTags = useMemo(() => namesOf('tags'), [books, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const keysOf = (b: Book) => {
    const m = meta.books[b.key] || {};
    return [...(m.genres || []).map(g => 'g:' + g), ...(m.tags || []).map(t => 't:' + t)];
  };
  const matches = (b: Book, fs: string[], ts: TagState, skip?: string) => {
    if (fs.length && !fs.includes(b.folder)) return false;
    const bt = keysOf(b);
    const inc = Object.keys(ts).filter(t => ts[t] === 1 && t !== skip);
    const exc = Object.keys(ts).filter(t => ts[t] === -1 && t !== skip);
    if (exc.some(t => bt.includes(t))) return false;
    if (!inc.length) return true;
    return mode === 'all' ? inc.every(t => bt.includes(t)) : inc.some(t => bt.includes(t));
  };
  const results = books.filter(b => matches(b, folders, tags));

  // ===================== screens =====================
  const shell = (body: React.ReactNode) => (
    <View style={st.screen}>
      {body}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          change={changeSettings}
          onClose={() => setShowSettings(false)}
          onLibraries={() => { setShowSettings(false); setScreen({kind: 'libraries'}); }}
          onClearSearches={() => changeApp(a => ({...a, searches: []}))}
          onClearHistory={() => changeApp(a => ({...a, recent: []}))}
          counts={{searches: app.searches.length, recent: app.recent.length}}
        />
      )}
      {(busy || message) && (
        <View style={st.overlay}>
          <View style={st.dialog}>
            <Text style={st.para}>{busy || message}</Text>
            {!busy && <Btn dark label="OK" onPress={() => setMessage(null)} />}
          </View>
        </View>
      )}
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

  // ----- home: search, recent searches, recently read, genres -----
  if (screen.kind === 'home') {
    return shell(
      <>
        <Header title="InkShelf" />
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
          onAddLibrary={() => setScreen({kind: 'browse', path: null})}
        />
        {taskbar('home')}
      </>,
    );
  }

  // ----- "view all" pages for Home rows -----
  if (screen.kind === 'gallery') {
    const items =
      screen.what === 'recent'
        ? recentFound().map(r => ({key: r.x.lib + r.x.key, title: r.x.title, sub: r.x.vol ? `Vol ${r.x.vol}` : r.x.libName, cover: r.x.cover, f: r.f, onPress: () => goBook(r.x, 'home')}))
        : genreCards().map(g => ({key: g.name, title: g.name, sub: `${g.count} book${g.count === 1 ? '' : 's'}`, cover: g.f ? xCover(g.f) : null, f: g.f, onPress: () => goGenre(g.name)}));
    return shell(
      <>
        <Header title={screen.what === 'recent' ? 'Recently read' : 'Explore by genre'} left="Home" onLeft={() => setScreen({kind: 'home'})} />
        <Gallery items={items} label={screen.what === 'recent' ? `${items.length} book${items.length === 1 ? '' : 's'}` : `${items.length} genres`} paging={settings.paging} grid={isGrid('gallery')} setGrid={setGridFor('gallery')} wantCovers={wantCovers} />
        {taskbar('home')}
      </>,
    );
  }

  // ----- newly added: books still waiting for a genre/tag or a summary -----
  if (screen.kind === 'new') {
    return shell(
      <>
        <Header title="Newly added" />
        <NewList items={fresh} libs={libs} ready={indexReady} paging={settings.paging} grid={isGrid('new')} setGrid={setGridFor('new')} cover={xCover} wantCovers={wantCovers} onEdit={goEdit} onOpen={f => goBook(snapOf(f), 'new')} />
        {taskbar('new')}
      </>,
    );
  }

  // ----- bookmarks -----
  if (screen.kind === 'bookmarks') {
    return shell(
      <>
        <Header title="My Bookmarks" />
        <SnapList
          items={app.bookmarks}
          libs={libs}
          paging={settings.paging}
          grid={isGrid('bookmarks')}
          setGrid={setGridFor('bookmarks')}
          empty="No bookmarks yet. Open a book and tap Bookmark to keep it here."
          onOpen={x => goBook(x, 'bookmarks')}
          onRemove={x => changeApp(a => ({...a, bookmarks: a.bookmarks.filter(y => !same(y, x.lib, x.key))}))}
        />
        {taskbar('bookmarks')}
      </>,
    );
  }

  // ----- list of libraries -----
  if (screen.kind === 'libraries') {
    return shell(
      <>
        <Header title="Libraries" left="Home" onLeft={() => setScreen({kind: 'home'})} />
        <ScrollView contentContainerStyle={st.pad}>
          <Text style={st.h1}>Your libraries</Text>
          {!hasNative() && <Text style={st.warn}>This copy of InkShelf is missing its native part, so it can't read folders or open books.</Text>}
          {libs.length === 0 && <Text style={st.para}>Add a folder with your books (EPUB, PDF and more). Each folder becomes a library.</Text>}
          {libs.map(l => (
            <View key={l.path} style={st.libRow}>
              <Pressable style={{flex: 1}} onPress={() => openLibrary(l)}>
                <Text style={st.libName}>{l.name}</Text>
                <Text style={st.small} numberOfLines={1}>{l.path}</Text>
              </Pressable>
              <Btn
                small
                icon="trash"
                a11y="Remove from list"
                onPress={async () => {
                  const n = libs.filter(x => x.path !== l.path);
                  setLibs(n);
                  await saveLibraries(n);
                  if (lib?.path === l.path) setLib(null);
                }}
              />
            </View>
          ))}
          <Btn dark icon="folder-plus" label="Add a library folder" onPress={() => setScreen({kind: 'browse', path: null})} style={{marginTop: px(16)}} />
          <Text style={[st.small, {marginTop: px(20)}]}>
            Removing a library only removes it from this list. Your books and saved details stay in the folder.
          </Text>
        </ScrollView>
      </>,
    );
  }

  // ----- folder browser -----
  if (screen.kind === 'browse') {
    return shell(
      <FolderBrowser
        path={screen.path}
        onGo={p => setScreen({kind: 'browse', path: p})}
        onCancel={() => setScreen(libs.length ? {kind: 'libraries'} : {kind: 'home'})}
        onPick={async p => {
          const name = p.split('/').filter(Boolean).pop() || 'Library';
          const n = [...libs.filter(x => x.path !== p), {name, path: p}];
          setLibs(n);
          await saveLibraries(n);
          openLibrary({name, path: p});
        }}
      />,
    );
  }

  // ----- book page -----
  if (screen.kind === 'book' || screen.kind === 'edit') {
    const b = books.find(x => x.key === screen.key);
    if (!b || !lib) {
      return shell(
        <>
          <Header title="" left="Back" onLeft={() => setScreen({kind: 'library'})} />
          <Text style={[st.para, st.pad]}>This book is no longer in the folder.</Text>
        </>,
      );
    }
    if (screen.kind === 'edit') {
      return shell(
        <EditPage
          book={b}
          meta={metaOf(b)}
          allGenres={allGenres}
          allTags={allTags}
          cover={coverUri(b)}
          onCancel={() => setScreen(screen.from === 'new' ? {kind: 'new'} : {kind: 'book', key: b.key})}
          onSave={async m => {
            await updateMeta(b.key, m);
            setScreen(screen.from === 'new' ? {kind: 'new'} : {kind: 'book', key: b.key});
          }}
        />,
      );
    }
    scheduleCovers([b]);
    const goFilter = (k: 'folder' | FilterKind, v: string) => {
      if (k === 'folder') { setFolders([v]); setTags({}); }
      else { setTags({[`${k}:${v}`]: 1}); setFolders([]); setFKind(k); }
      setPage(1);
      setScreen({kind: 'library'});
    };
    return shell(
      <BookPage
        key={b.key}
        book={b}
        meta={metaOf(b)}
        title={titleOf(b)}
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
            coverOut: `${lib.path}/.inkshelf/paste.png`,
            text: what === 'cover' ? undefined : text,
          });
          if (err) setMessage(err);
        }}
        onMark={() => toggleMark(b)}
        onEdit={() => setScreen({kind: 'edit', key: b.key})}
        onBack={() => setScreen({kind: screen.from || 'library'})}
        onFilter={goFilter}
      />,
    );
  }

  // ----- library: filters + results -----
  const per = grid ? GRID_PER_PAGE : LIST_PER_PAGE;
  const pages = Math.max(1, Math.ceil(results.length / per));
  const pg = Math.min(page, pages);
  const chunk = results.slice((pg - 1) * per, pg * per);
  scheduleCovers(chunk);
  const sideW = showFilters ? Math.round(W * 0.34) : 0;
  const resW = W - sideW;
  const avail = H - px(64) - px(58) - px(64) - TASK_H;
  const active = folders.length + Object.keys(tags).length;
  const folderCount = (f: string) => books.filter(b => b.folder === f && matches(b, [], tags)).length;
  const tagCount = (k: string) => books.filter(b => keysOf(b).includes(k) && matches(b, folders, tags, k)).length;
  const fNames = fKind === 'g' ? allGenres : allTags;
  const fixedTop = px(10) + px(36) + px(36) + Math.min(allFolders.length, 5) * px(40) + px(46) + px(40) + px(24);
  const perT = Math.max(4, Math.floor((H - px(64) - fixedTop - px(64) - TASK_H) / px(40)));
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

  let content: React.ReactNode;
  if (!books.length) {
    content = <Text style={[st.para, {padding: px(10)}]}>No books found in this folder. InkShelf looks for EPUB, PDF, CBZ, FB2, XPS, MOBI, TXT and DOCX files (folders starting with _ or . are skipped).</Text>;
  } else if (!results.length) {
    content = (
      <View style={{padding: px(10)}}>
        <Text style={st.para}>No books match these filters.</Text>
        <Btn small icon="close" label="Clear filters" onPress={() => { setFolders([]); setTags({}); }} />
      </View>
    );
  } else if (!grid) {
    const rowH = Math.floor(avail / LIST_PER_PAGE);
    const ch = rowH - px(14);
    content = chunk.map(b => {
      const m = metaOf(b);
      return (
        <Pressable key={b.key} style={[st.row, {height: rowH}]} onPress={() => setScreen({kind: 'book', key: b.key})}>
          <Cover uri={coverUri(b)} w={Math.round((ch * 2) / 3)} h={ch} title={titleOf(b)} />
          <View style={st.rowText}>
            <Text style={st.rowTitle} numberOfLines={2}>
              {titleOf(b)}
              {b.vols.length ? <Text style={st.small}>{`  · ${b.vols.length} vols`}</Text> : null}
            </Text>
            <View style={st.pillLine}>
              {(() => {
                // only whole pills: show what fits on one line, then "+N"
                const all = [...(b.folder ? [b.folder] : []), ...(m.genres || [])];
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
                    {shown.map((t, i) => <Pill key={t + i} label={t} active={(i > 0 || !b.folder) && tags['g:' + t] === 1} />)}
                    {extra > 0 ? <Pill label={`+${extra}`} /> : null}
                  </>
                );
              })()}
            </View>
            {m.description ? (
              <Text style={st.teaser} numberOfLines={titleOf(b).length > (showFilters ? 34 : 50) ? 1 : 2}>{m.description.replace(/\s+/g, ' ')}</Text>
            ) : null}
          </View>
        </Pressable>
      );
    });
  } else {
    const cellH = Math.floor(avail / 4);
    const ch = Math.min(cellH - px(48), Math.round((resW / 3 - px(16)) * 1.5));
    const rows = [];
    for (let i = 0; i < chunk.length; i += 3) {
      rows.push(
        <View key={i} style={{flexDirection: 'row', height: cellH}}>
          {[0, 1, 2].map(j => {
            const b = chunk[i + j];
            return (
              <View key={j} style={st.gridCell}>
                {b && (
                  <Pressable onPress={() => setScreen({kind: 'book', key: b.key})} style={{alignItems: 'center', width: '100%'}}>
                    <Cover uri={coverUri(b)} w={Math.round((ch * 2) / 3)} h={ch} title={titleOf(b)} />
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
            <IconBtn name="sidebar" label={showFilters ? 'Hide filters' : 'Show filters'} dark={showFilters} onPress={() => setShowFilters(!showFilters)} size={px(46)} style={{borderRadius: px(12)}} />
            {!showFilters && active ? <View style={st.badge}><Text style={st.badgeText}>{active}</Text></View> : null}
          </View>
        </View>
        <Pressable style={{flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}} onPress={() => setScreen({kind: 'libraries'})} accessibilityLabel="Switch library">
          <Text style={st.headerName} numberOfLines={1}>{lib?.name || 'Library'}</Text>
          <Icon name="down" size={px(24)} />
        </Pressable>
        <View style={{minWidth: px(110), alignItems: 'flex-end'}}>
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
                  <Pressable onPress={() => { setFolders([]); setTags({}); setPage(1); }} hitSlop={px(8)}>
                    <Text style={st.clear}>Clear</Text>
                  </Pressable>
                )}
              </View>
              {allFolders.length > 1 && (
                <>
                  <Text style={st.section}>Folder</Text>
                  {allFolders.slice(0, 5).map(f => (
                    <FilterRow key={f} label={f || '(main folder)'} count={folderCount(f)} state={folders.includes(f) ? 1 : 0}
                      onPress={() => { setFolders(folders.includes(f) ? folders.filter(x => x !== f) : [...folders, f]); setPage(1); }} />
                  ))}
                </>
              )}
              <View style={st.kindTabs}>
                {(['g', 't'] as FilterKind[]).map(k => (
                  <Pressable key={k} onPress={() => { setFKind(k); setTPage(1); }} style={[st.kindTab, fKind === k && st.btnDark]}>
                    <Text style={[st.kindTabText, fKind === k && {color: '#ffffff'}]}>{k === 'g' ? 'Genre' : 'Tags'}</Text>
                  </Pressable>
                ))}
              </View>
              {fNames.length === 0 ? (
                <Text style={st.hint}>{`No ${fKind === 'g' ? 'genres' : 'tags'} yet. Open a book and tap Edit to add some.`}</Text>
              ) : (
                <>
                  <View style={st.modeRow}>
                    <Text style={st.small}>Match </Text>
                    <Pill label="All" active={mode === 'all'} onPress={() => { setMode('all'); setPage(1); }} />
                    <Pill label="Any" active={mode === 'any'} onPress={() => { setMode('any'); setPage(1); }} />
                  </View>
                  <Text style={st.hint}>Tap once to include, again to exclude.</Text>
                  <View style={{flex: 1}}>
                    {tagChunk.map(t => <FilterRow key={t} label={t} count={tagCount(`${fKind}:${t}`)} state={tags[`${fKind}:${t}`] || 0} onPress={() => cycleTag(`${fKind}:${t}`)} />)}
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
            <Text style={st.resCount}>{`${results.length} book${results.length === 1 ? '' : 's'}`}</Text>
            <View style={{flexDirection: 'row'}}>
              <ViewIcon kind="list" on={!grid} onPress={() => { setGrid(false); setPage(Math.floor(((pg - 1) * per) / LIST_PER_PAGE) + 1); }} />
              <ViewIcon kind="grid" on={grid} onPress={() => { setGrid(true); setPage(Math.floor(((pg - 1) * per) / GRID_PER_PAGE) + 1); }} />
            </View>
          </View>
          <View style={{flex: 1, paddingHorizontal: px(10)}}>{content}</View>
          <View style={st.pager}>
            <IconBtn name="back" label="Previous page" disabled={pg <= 1} onPress={() => setPage(pg - 1)} />
            <Text style={st.pageText}>{`${pg} / ${pages}`}</Text>
            <IconBtn name="forward" label="Next page" disabled={pg >= pages} onPress={() => setPage(pg + 1)} />
          </View>
        </View>
      </View>
      {taskbar('library')}
    </>,
  );
}

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
  cover: string | null;
  paging: Settings['paging'];
  volGrid: boolean;
  setVolGrid: (g: boolean) => void;
  onRead: (path: string) => void;
  onEdit: () => void;
  onBack: () => void;
  onFilter: (k: 'folder' | FilterKind, v: string) => void;
  marked: boolean;
  onMark: () => void;
  onNotes: (notes: Note[]) => void;
  onPaste: (what: 'cover' | 'details' | 'both' | 'copy') => void;
}) {
  const {book: b, meta: m, title, cover, paging, volGrid, setVolGrid, onRead, onEdit, onBack, onFilter, marked, onMark, onNotes, onPaste} = props;
  const [notesOpen, setNotesOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [lp, setLp] = useState(0);
  const [rp, setRp] = useState(0);
  const scroll = paging === 'scroll';

  const LW = Math.round(W * 0.37);
  const RW = W - LW;
  const lIn = LW - px(28);
  const rIn = RW - px(32);
  const titleLines = Math.min(2, wrapWords(title, Math.floor((W - px(32)) / (px(26) * 0.56))).length);
  const titleH = px(14) + titleLines * px(34) + px(10);
  const colH = H - px(64) - titleH;
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
  field('Type', b.folder || undefined, b.folder ? () => onFilter('folder', b.folder) : undefined);
  field('Completely translated', m.translated);

  // ----- right: description, then volumes -----
  const right: Item[] = [];
  const perLine = Math.floor(rIn / (px(18) * 0.53));
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
          <Text style={st.colHead}>{`${b.vols.length} volumes`}</Text>
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
            <Pressable style={st.volRow} onPress={() => onRead(v.path)}>
              <Icon name="play" size={px(22)} />
              <Text style={[st.volRowText, {marginLeft: px(8)}]}>{`Vol ${v.n}`}</Text>
              <Text style={[st.small, {flex: 1, textAlign: 'right'}]} numberOfLines={1}>{vlabel(v)}</Text>
            </Pressable>
          ),
        }),
      );
    } else {
      const per = 4;
      const cw = Math.floor((rIn - (per - 1) * px(8)) / per);
      for (let i = 0; i < b.vols.length; i += per) {
        right.push({
          h: px(72),
          vol: true,
          node: (
            <View style={{flexDirection: 'row'}}>
              {b.vols.slice(i, i + per).map((v, j) => (
                <Pressable key={v.path} style={[st.volCell, {width: cw, marginLeft: j ? px(8) : 0}]} onPress={() => onRead(v.path)}>
                  <Text style={st.volCellText}>{`Vol ${v.n}`}</Text>
                  {vlabel(v) ? <Text style={st.volCellSub} numberOfLines={1}>{vlabel(v)}</Text> : null}
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
  const start = (
    <Pressable style={[st.startBtn, {width: lIn}]} onPress={() => onRead(b.files[0])}>
      <Icon name="play-on" size={px(26)} color="#ffffff" />
      {b.vols.length ? <Text style={[st.startText, {marginLeft: px(8)}]}>{`Vol ${b.vols[0].n}`}</Text> : null}
    </Pressable>
  );
  return (
    <>
      <View style={st.header}>
        <IconBtn bare name="back" label="Back" onPress={onBack} iconSize={px(30)} />
        <View style={{flex: 1}} />
        <IconBtn name="paste" label="Paste into note" onPress={() => setPasteOpen(true)} style={{marginRight: px(10)}} />
        <IconBtn name={marked ? 'bookmark-on' : 'bookmark'} label={marked ? 'Remove bookmark' : 'Bookmark'} onPress={onMark} style={{marginRight: px(10)}} />
        <IconBtn name="edit" label="Edit details" onPress={onEdit} style={{marginRight: px(6)}} />
        <CloseBtn />
      </View>
      <View style={{height: titleH, paddingHorizontal: px(16), justifyContent: 'center', borderBottomWidth: 1, borderColor: '#888888'}}>
        <Text style={st.bookTitle} numberOfLines={2}>{title}</Text>
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
      {notesOpen ? <NotesSheet title={title} notes={m.notes || []} onChange={onNotes} onClose={() => setNotesOpen(false)} /> : null}
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

// ---------- taskbar ----------



type Tab = 'library' | 'new' | 'home' | 'bookmarks' | 'settings';
function Taskbar({tab, onTab, newCount}: {tab: Tab; onTab: (t: Tab) => void; newCount: number}) {
  const items: {t: Tab; icon: IconName; label: string}[] = [
    {t: 'library', icon: 'library', label: 'Library'},
    {t: 'new', icon: 'new', label: 'Newly added'},
    {t: 'home', icon: 'home', label: 'Home'},
    {t: 'bookmarks', icon: 'bookmark', label: 'Bookmarks'},
    {t: 'settings', icon: 'settings', label: 'Settings'},
  ];
  return (
    <View style={st.taskbar}>
      {items.map(({t, icon, label}) => {
        const on = t === tab;
        return (
          <Pressable key={t} onPress={() => onTab(t)} style={st.task} accessibilityRole="button" accessibilityLabel={label}>
            <View style={[st.taskIcon, t === 'home' && st.taskHome, on && st.btnDark]}>
              <Icon name={on && icon === 'bookmark' ? 'bookmark-on' : icon} size={px(30)} color={on ? '#ffffff' : BLACK} />
              {t === 'new' && newCount > 0 ? (
                <View style={[st.badge, on && {backgroundColor: '#ffffff', borderColor: BLACK}]}>
                  <Text style={[st.badgeText, on && {color: BLACK}]}>{newCount > 99 ? '99+' : newCount}</Text>
                </View>
              ) : null}
            </View>
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
function SettingsSheet({settings, change, onClose, onLibraries, onClearSearches, onClearHistory, counts}: {
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
    <View style={st.sheetWrap}>
      <Pressable style={{flex: 1}} onPress={onClose} accessibilityLabel="Close settings" />
      <View style={st.sheet}>
        <Pressable onPress={onClose} hitSlop={px(12)} style={{alignItems: 'center'}}>
          <View style={st.handle} />
          <Text style={st.sheetTitle}>Settings</Text>
        </Pressable>

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
          <View style={{flex: 1, alignItems: 'center', marginHorizontal: px(6)}}>
            <Seg
              options={[
                {label: <Icon name="sidebar" size={px(30)} />, on: settings.showFilters, onPress: () => change({showFilters: true})},
                {label: <Icon name="close" size={px(26)} />, on: !settings.showFilters, onPress: () => change({showFilters: false})},
              ]}
            />
            <Text style={st.tileLabel}>Filters panel</Text>
          </View>
        </View>

        <View style={{flexDirection: 'row', marginTop: px(18)}}>
          <Tile label="Library view">{view('libraryGrid')}</Tile>
          <Tile label="Volumes view">{view('volumeGrid')}</Tile>
        </View>

        <View style={{flexDirection: 'row', marginTop: px(18)}}>
          <RoundBtn label="Libraries" onPress={onLibraries}>
            <Icon name="folder-plus" size={px(30)} />
          </RoundBtn>
          <RoundBtn label="Clear searches" note={`${counts.searches} saved`} onPress={onClearSearches} dim={!counts.searches}>
            <Icon name="search" size={px(30)} />
          </RoundBtn>
          <RoundBtn label="Clear history" note={`${counts.recent} recent`} onPress={onClearHistory} dim={!counts.recent}>
            <Icon name="clock" size={px(30)} />
          </RoundBtn>
        </View>

        <Btn dark icon="check" a11y="Done" onPress={onClose} style={{marginTop: px(20)}} />
      </View>
    </View>
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
  onPress: () => void;
  action?: {icon: IconName; label: string; onPress: () => void; dark?: boolean};
};

/** count on the left, list/grid buttons on the right */
function Toolbar({text, grid, setGrid}: {text: string; grid: boolean; setGrid: (g: boolean) => void}) {
  return (
    <View style={st.toolbar}>
      <Text style={st.resCount} numberOfLines={1}>{text}</Text>
      <View style={{flexDirection: 'row'}}>
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
        <Cover uri={x.cover} w={Math.round((ch * 2) / 3)} h={ch} title={x.title} />
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
        <Cover uri={x.cover} w={coverW} h={coverH} title={x.title} />
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

function SnapList({items, libs, paging, grid, setGrid, empty, onOpen, onRemove}: {items: Snap[]; libs: Lib[]; paging: Settings['paging']; grid: boolean; setGrid: (g: boolean) => void; empty: string; onOpen: (x: Snap) => void; onRemove: (x: Snap) => void}) {
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
        top={px(64) + (chips ? px(62) : 0) + px(60)}
        paging={paging}
        empty={empty}
        items={shown.map(x => ({
          key: x.lib + x.key,
          title: x.title,
          sub: [x.folder || x.libName, x.vol ? `Vol ${x.vol}` : ''].filter(Boolean).join('  ·  '),
          cover: x.cover,
          pills: x.genres,
          onPress: () => onOpen(x),
          action: {icon: 'bookmark-remove', label: 'Remove bookmark', onPress: () => onRemove(x)},
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
function NewList({items, libs, ready, paging, grid, setGrid, cover, wantCovers, onEdit, onOpen}: {
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
  const shown = items.filter(f => which === 'all' || (which === 'genre' ? noGenre(f) : which === 'summary' ? noSum(f) : f.lib.path === which));
  wantCovers(shown);
  const opts = [
    {id: 'all', label: `All (${items.length})`},
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
      <Toolbar text={`${shown.length} need details  ·  newest first`} grid={grid} setGrid={setGrid} />
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
function FolderBrowser({path, onGo, onPick, onCancel}: {path: string | null; onGo: (p: string | null) => void; onPick: (p: string) => void; onCancel: () => void}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [roots, setRoots] = useState<{label: string; path: string}[]>([]);
  const [pg, setPg] = useState(1);
  useEffect(() => {
    setPg(1);
    (async () => {
      if (path) {
        setEntries((await listDir(path)).filter(e => e.isDir || /\.(epub|pdf|cbz|fb2|xps|mobi|txt|docx)$/i.test(e.name)));
      } else {
        const r = [{label: 'Supernote (internal storage)', path: '/storage/emulated/0'}];
        try {
          const ext: string[] = (await FileUtils.getExternalDirPath()) || [];
          ext.filter(p => !p.startsWith('/storage/emulated')).forEach((p, i) => r.push({label: `SD card${ext.length > 2 ? ' ' + (i + 1) : ''}`, path: p.replace(/\/+$/, '')}));
        } catch (e) {}
        setRoots(r);
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
      <Header title="Choose a folder" left="Cancel" onLeft={onCancel} />
      <View style={[st.pad, {flex: 1}]}>
        {!path ? (
          <>
            <Text style={st.para}>Where are your books?</Text>
            {roots.map(r => (
              <Pressable key={r.path} style={st.folderRow} onPress={() => onGo(r.path)}>
                <Text style={st.folderName}>{r.label}  ›</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <Text style={st.small} numberOfLines={2}>{path}</Text>
            <View style={{flexDirection: 'row', marginVertical: px(10)}}>
              <Btn small icon="up" a11y="Up one folder" onPress={() => onGo(isRoot ? null : parent)} />
              <Btn small dark icon="check" label="Use this folder" onPress={() => onPick(path)} style={{marginLeft: px(10), flex: 1}} />
            </View>
            {entries === null ? <Text style={st.para}>Loading…</Text> : null}
            {entries && !entries.length ? <Text style={st.para}>This folder is empty.</Text> : null}
            {shown.map(e =>
              e.isDir ? (
                <Pressable key={e.path} style={st.folderRow} onPress={() => onGo(e.path)}>
                  <Text style={st.folderName} numberOfLines={1}>{`▸  ${e.name}`}</Text>
                </Pressable>
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

function EditPage({book, meta, allGenres, allTags, cover, onSave, onCancel}: {book: Book; meta: Meta; allGenres: string[]; allTags: string[]; cover: string | null; onSave: (m: Meta) => void; onCancel: () => void}) {
  const [title, setTitle] = useState(meta.title || book.fileTitle);
  const [genres, setGenres] = useState<string[]>(meta.genres || []);
  const [tags, setTags] = useState<string[]>(meta.tags || []);
  const [desc, setDesc] = useState(meta.description || '');
  const [img, setImg] = useState<string | undefined>(meta.cover);
  const [language, setLanguage] = useState(meta.language || '');
  const [status, setStatus] = useState(meta.status || '');
  const [translated, setTranslated] = useState<Meta['translated']>(meta.translated);
  const guess = (book.folder.match(/^(\w+)\s+novels?$/i) || [])[1];
  const langs = Array.from(new Set([guess, 'Chinese', 'Korean', 'Japanese', 'English'].filter(Boolean) as string[])).filter(l => l !== language);
  return (
    <>
      <Header title="Edit details" left="Cancel" onLeft={onCancel} />
      <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
        <Text style={st.label}>Title</Text>
        <TextInput style={st.input} value={title} onChangeText={setTitle} />
        <Text style={st.small}>{`File name: ${book.fileTitle}`}</Text>

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
              try {
                const p = await FileSelector.selectImage();
                if (p) setImg(String(p));
              } catch (e) {}
            }} />
            {img ? <Btn small label="Use the book's own cover" onPress={() => setImg(undefined)} style={{marginTop: px(8)}} /> : null}
          </View>
        </View>

        <Btn
          dark
          icon="check"
          a11y="Save"
          onPress={() =>
            onSave({
              title: title.trim() && title.trim() !== book.fileTitle ? title.trim() : undefined,
              genres,
              tags,
              description: desc.trim() || undefined,
              cover: img,
              language: language.trim() || undefined,
              status: status.trim() || undefined,
              translated,
            })
          }
          style={{marginTop: px(24)}}
        />
        <View style={{height: px(200)}} />
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
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
  taskbar: {height: TASK_H, flexDirection: 'row', borderTopWidth: 2, borderColor: BLACK, backgroundColor: '#ffffff'},
  task: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  taskIcon: {width: px(64), height: px(48), borderRadius: px(24), alignItems: 'center', justifyContent: 'center'},
  taskText: {fontSize: px(13), color: BLACK, marginTop: px(1)},
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
  markBadge: {position: 'absolute', left: px(6), top: px(6), backgroundColor: BLACK, borderRadius: px(6), paddingHorizontal: px(6), paddingVertical: px(2)},
  noteTabPlus: {flexGrow: 0, flexShrink: 0, flexBasis: px(52), width: px(52), borderStyle: 'dashed', backgroundColor: '#ffffff', marginRight: 0},
  toolbar: {height: px(60), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: px(16)},
  pagerName: {fontSize: px(15), fontWeight: 'bold', color: BLACK},
  colHead: {fontSize: px(21), fontWeight: 'bold', color: BLACK},
  bodyText: {fontSize: px(18), lineHeight: px(27), color: BLACK},
  volHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: px(56)},
  volRow: {height: px(42), flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(8), paddingHorizontal: px(12)},
  volRowText: {fontSize: px(18), fontWeight: 'bold', color: BLACK, marginRight: px(10)},
  volCell: {height: px(62), borderWidth: 1.5, borderColor: BLACK, borderRadius: px(8), alignItems: 'center', justifyContent: 'center', paddingHorizontal: px(4)},
  volCellText: {fontSize: px(17), fontWeight: 'bold', color: BLACK},
  volCellSub: {fontSize: px(12), color: '#333333', marginTop: px(2)},
  kindTabs: {flexDirection: 'row', marginTop: px(10), marginBottom: px(6)},
  kindTab: {flex: 1, borderWidth: 1.5, borderColor: BLACK, paddingVertical: px(5), alignItems: 'center', marginRight: px(4), borderRadius: px(6)},
  kindTabText: {fontSize: px(17), fontWeight: 'bold', color: BLACK},
  choice: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLACK, borderRadius: px(10), padding: px(14), marginBottom: px(12)},
  radio: {width: px(24), height: px(24), borderRadius: px(12), borderWidth: 2, borderColor: BLACK, marginRight: px(14)},
  choiceText: {fontSize: px(20), fontWeight: 'bold', color: BLACK},
  overlay: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.88)', justifyContent: 'center', padding: px(40)},
  dialog: {backgroundColor: '#ffffff', borderWidth: 3, borderColor: BLACK, borderRadius: px(14), padding: px(24)},
});
