/**
 * InkShelf - a library for the Supernote.
 * Pick any folder as a library; books are listed by file name; add titles, tags,
 * descriptions and covers on the device; filter by folder and tag; tap to read.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {FileUtils, PluginManager, RattaFileSelector as FileSelector} from 'sn-plugin-lib';
import {AppState, Book, DEFAULT_SETTINGS, EMPTY_STATE, Lib, Meta, MetaStore, Settings, Snap, Vol, coverFor, loadLibraries, loadMeta, loadSettings, loadState, saveLibraries, saveMeta, saveSettings, saveState, scanLibrary} from './src/library';
import {on} from './src/events';
import {Entry, hasNative, listDir, openBook} from './src/native';

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
  | {kind: 'libraries'}
  | {kind: 'browse'; path: string | null}
  | {kind: 'library'}
  | {kind: 'book'; key: string; from?: 'home' | 'bookmarks' | 'library'}
  | {kind: 'edit'; key: string};
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
function Btn({label, onPress, dark, small, style}: {label: string; onPress: () => void; dark?: boolean; small?: boolean; style?: any}) {
  return (
    <Pressable onPress={onPress} hitSlop={px(6)} style={[st.btn, small && st.btnSmall, dark && st.btnDark, style]}>
      <Text style={[st.btnText, small && st.btnTextSmall, dark && {color: '#ffffff'}]}>{label}</Text>
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
  const c = on ? '#ffffff' : BLACK;
  return (
    <Pressable onPress={onPress} hitSlop={px(6)} accessibilityRole="button" accessibilityLabel={kind === 'list' ? 'List view' : 'Grid view'} style={[st.iconBtn, on && st.btnDark]}>
      {kind === 'list' ? (
        <View>
          {[0, 1, 2].map(i => (
            <View key={i} style={{flexDirection: 'row', alignItems: 'center', marginVertical: px(2)}}>
              <View style={{width: px(5), height: px(5), backgroundColor: c, marginRight: px(4)}} />
              <View style={{width: px(18), height: px(3), backgroundColor: c}} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{width: px(24), flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'}}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={{width: px(10), height: px(10), backgroundColor: c, marginBottom: i < 2 ? px(4) : 0}} />
          ))}
        </View>
      )}
    </Pressable>
  );
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

function Header({left, title, onLeft}: {left?: string; title: string; onLeft?: () => void}) {
  return (
    <View style={st.header}>
      <View style={{minWidth: px(130)}}>
        {left && onLeft ? (
          <Pressable onPress={onLeft} hitSlop={px(10)} style={st.headerBtn}>
            <Text style={st.headerBtnText}>{left}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={st.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{minWidth: px(130), alignItems: 'flex-end'}}>
        <Pressable onPress={() => PluginManager.closePluginView()} hitSlop={px(10)} style={st.headerBtn}>
          <Text style={st.headerBtnText}>Close ✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

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

  async function openLibrary(l: Lib, then?: Screen) {
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
    setBusy(null);
    setScreen(then || {kind: 'library'});
    changeApp(a => ({...a, lastLib: l.path}));
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
  function goBook(x: Snap, from: 'home' | 'bookmarks') {
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

  const taskbar = (tab: 'home' | 'library' | 'bookmarks') => (
    <Taskbar
      tab={tab}
      onTab={t => {
        if (t === 'home') setScreen({kind: 'home'});
        else if (t === 'library') goLibrary();
        else if (t === 'bookmarks') setScreen({kind: 'bookmarks'});
        else setShowSettings(true);
      }}
    />
  );

  // ----- home: search, recent searches, recently read -----
  if (screen.kind === 'home') {
    return shell(
      <>
        <Header title="InkShelf" />
        <Home
          libs={libs}
          lib={lib}
          books={books}
          meta={meta}
          app={app}
          paging={settings.paging}
          onSearched={rememberSearch}
          onForgetSearch={q => changeApp(a => ({...a, searches: a.searches.filter(x => x !== q)}))}
          onOpen={x => goBook(x, 'home')}
          onLibrary={l => openLibrary(l)}
          onAddLibrary={() => setScreen({kind: 'browse', path: null})}
        />
        {taskbar('home')}
      </>,
    );
  }

  // ----- bookmarks -----
  if (screen.kind === 'bookmarks') {
    return shell(
      <>
        <Header title="Bookmarks" />
        <SnapList
          items={app.bookmarks}
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
        <Header title="Libraries" left="‹ Home" onLeft={() => setScreen({kind: 'home'})} />
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
                label="Remove"
                onPress={async () => {
                  const n = libs.filter(x => x.path !== l.path);
                  setLibs(n);
                  await saveLibraries(n);
                  if (lib?.path === l.path) setLib(null);
                }}
              />
            </View>
          ))}
          <Btn dark label="＋  Add a library folder" onPress={() => setScreen({kind: 'browse', path: null})} style={{marginTop: px(16)}} />
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
          <Header title="" left="‹ Back" onLeft={() => setScreen({kind: 'library'})} />
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
          onCancel={() => setScreen({kind: 'book', key: b.key})}
          onSave={async m => {
            await updateMeta(b.key, m);
            setScreen({kind: 'book', key: b.key});
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
        <Btn small label="Clear filters" onPress={() => { setFolders([]); setTags({}); }} />
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
        <Pressable onPress={() => setShowFilters(!showFilters)} hitSlop={px(10)} style={[st.headerBtn, {minWidth: px(130)}]}>
          <Text style={st.headerBtnText}>{showFilters ? '‹ Hide filters' : `Filters${active ? ` (${active})` : ''} ›`}</Text>
        </Pressable>
        <Pressable style={{flex: 1}} onPress={() => setScreen({kind: 'libraries'})}>
          <Text style={st.headerTitle} numberOfLines={1}>{`${lib?.name || 'Library'} ▾`}</Text>
        </Pressable>
        <View style={{minWidth: px(130), alignItems: 'flex-end'}}>
          <Pressable onPress={() => PluginManager.closePluginView()} hitSlop={px(10)} style={st.headerBtn}>
            <Text style={st.headerBtnText}>Close ✕</Text>
          </Pressable>
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
                    <Pressable disabled={tp <= 1} onPress={() => setTPage(tp - 1)} hitSlop={px(8)} style={[st.arrow, tp <= 1 && st.dim]}>
                      <Text style={st.arrowText}>‹</Text>
                    </Pressable>
                    <Text style={st.small}>{`${tp} / ${tPages}`}</Text>
                    <Pressable disabled={tp >= tPages} onPress={() => setTPage(tp + 1)} hitSlop={px(8)} style={[st.arrow, tp >= tPages && st.dim]}>
                      <Text style={st.arrowText}>›</Text>
                    </Pressable>
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
            <Pressable disabled={pg <= 1} onPress={() => setPage(pg - 1)} style={[st.pageBtn, pg <= 1 && st.dim]}>
              <Text style={st.pageBtnText}>‹ Prev</Text>
            </Pressable>
            <Text style={st.pageText}>{`Page ${pg} of ${pages}`}</Text>
            <Pressable disabled={pg >= pages} onPress={() => setPage(pg + 1)} style={[st.pageBtn, pg >= pages && st.dim]}>
              <Text style={st.pageBtnText}>Next ›</Text>
            </Pressable>
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
      <Pressable disabled={page <= 0} onPress={() => onPage(page - 1)} hitSlop={px(8)} style={[st.arrow, page <= 0 && st.dim]}>
        <Text style={st.arrowText}>‹</Text>
      </Pressable>
      <View style={{alignItems: 'center', flex: 1}}>
        {name ? <Text style={st.pagerName} numberOfLines={1}>{name}</Text> : null}
        <Text style={st.small}>{`${page + 1} / ${pages}`}</Text>
      </View>
      <Pressable disabled={page >= pages - 1} onPress={() => onPage(page + 1)} hitSlop={px(8)} style={[st.arrow, page >= pages - 1 && st.dim]}>
        <Text style={st.arrowText}>›</Text>
      </Pressable>
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
}) {
  const {book: b, meta: m, title, cover, paging, volGrid, setVolGrid, onRead, onEdit, onBack, onFilter, marked, onMark} = props;
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
              <Text style={st.volRowText}>{`▶  Vol ${v.n}`}</Text>
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

  const top = <Cover uri={cover} w={coverW} h={coverH} title={title} />;
  const start = (
    <Pressable style={[st.startBtn, {width: lIn}]} onPress={() => onRead(b.files[0])}>
      <Text style={st.startText}>{b.vols.length ? `▶  Read Vol ${b.vols[0].n}` : '▶  Start reading'}</Text>
    </Pressable>
  );
  return (
    <>
      <View style={st.header}>
        <Pressable onPress={onBack} hitSlop={px(10)} style={[st.headerBtn, {minWidth: px(130)}]}>
          <Text style={st.headerBtnText}>‹ Back</Text>
        </Pressable>
        <View style={{flex: 1}} />
        <Pressable onPress={onMark} hitSlop={px(8)} style={[st.editBtn, {flexDirection: 'row', alignItems: 'center', marginRight: px(10)}, marked && st.btnDark]}>
          <RibbonIcon color={marked ? '#ffffff' : BLACK} bg={marked ? BLACK : '#ffffff'} filled={marked} size={px(16)} />
          <Text style={[st.editText, {marginLeft: px(6)}, marked && {color: '#ffffff'}]}>{marked ? 'Bookmarked' : 'Bookmark'}</Text>
        </Pressable>
        <Pressable onPress={onEdit} hitSlop={px(8)} style={st.editBtn}>
          <Text style={st.editText}>✎ Edit</Text>
        </Pressable>
        <Pressable onPress={() => PluginManager.closePluginView()} hitSlop={px(10)} style={[st.headerBtn, {marginLeft: px(12)}]}>
          <Text style={st.headerBtnText}>Close ✕</Text>
        </Pressable>
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
    </>
  );
}

// ---------- taskbar + icons (drawn, so they look the same on every device) ----------
function HomeIcon({c, size}: {c: string; size: number}) {
  const u = size / 24;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'flex-end'}}>
      <View style={{width: 0, height: 0, borderLeftWidth: 12 * u, borderRightWidth: 12 * u, borderBottomWidth: 10 * u, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: c}} />
      <View style={{width: 17 * u, height: 12 * u, borderWidth: 2.5 * u, borderTopWidth: 0, borderColor: c, alignItems: 'center', justifyContent: 'flex-end'}}>
        <View style={{width: 5 * u, height: 7 * u, backgroundColor: c}} />
      </View>
    </View>
  );
}
function ShelfIcon({c, size}: {c: string; size: number}) {
  const u = size / 24;
  return (
    <View style={{width: size, height: size, justifyContent: 'flex-end'}}>
      <View style={{flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 2 * u}}>
        {[20, 16, 20, 14].map((h, i) => (
          <View key={i} style={{width: 4 * u, height: h * u, borderWidth: 2 * u, borderColor: c, marginRight: 1.5 * u, backgroundColor: i === 1 ? c : 'transparent', transform: i === 3 ? [{rotate: '-14deg'}] : []}} />
        ))}
      </View>
      <View style={{height: 2.5 * u, backgroundColor: c}} />
    </View>
  );
}
function RibbonIcon({color, bg, filled, size}: {color: string; bg: string; filled?: boolean; size: number}) {
  const w = Math.round(size * 0.75);
  const d = size * 0.3; // depth of the notch
  const t = Math.max(2, size / 10);
  if (filled) {
    return (
      <View style={{width: w, height: size, backgroundColor: color}}>
        <View style={{position: 'absolute', bottom: 0, left: 0, width: 0, height: 0, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderBottomWidth: d, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: bg}} />
      </View>
    );
  }
  // outline: three sides plus a "V" at the bottom
  const L = Math.sqrt((w / 2) * (w / 2) + d * d);
  const ang = (Math.atan2(d, w / 2) * 180) / Math.PI;
  const line = (sign: number) => (
    <View style={{position: 'absolute', width: L, height: t, backgroundColor: color, left: (sign < 0 ? w / 4 : (3 * w) / 4) - L / 2, top: size - d / 2 - t / 2, transform: [{rotate: `${sign * ang}deg`}]}} />
  );
  return (
    <View style={{width: w, height: size}}>
      <View style={{position: 'absolute', left: 0, top: 0, width: w, height: size - t / 2, borderWidth: t, borderBottomWidth: 0, borderColor: color}} />
      {line(-1)}
      {line(1)}
    </View>
  );
}
function SlidersIcon({c, size}: {c: string; size: number}) {
  const u = size / 24;
  return (
    <View style={{width: size, height: size, justifyContent: 'space-around', paddingVertical: 2 * u}}>
      {[14, 5, 11].map((x, i) => (
        <View key={i} style={{height: 2.5 * u, backgroundColor: c, justifyContent: 'center'}}>
          <View style={{position: 'absolute', left: x * u, width: 7 * u, height: 7 * u, borderRadius: 4 * u, borderWidth: 2.5 * u, borderColor: c, backgroundColor: c === '#ffffff' ? BLACK : '#ffffff'}} />
        </View>
      ))}
    </View>
  );
}

function SearchIcon({c, size}: {c: string; size: number}) {
  const u = size / 24;
  return (
    <View style={{width: size, height: size}}>
      <View style={{position: 'absolute', left: 2 * u, top: 2 * u, width: 14 * u, height: 14 * u, borderRadius: 7 * u, borderWidth: 2.5 * u, borderColor: c}} />
      <View style={{position: 'absolute', left: 13 * u, top: 17 * u, width: 10 * u, height: 3 * u, backgroundColor: c, transform: [{rotate: '45deg'}]}} />
    </View>
  );
}
function ClockIcon({c, size}: {c: string; size: number}) {
  const u = size / 24;
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, borderWidth: 2.5 * u, borderColor: c}}>
      <View style={{position: 'absolute', left: 9.5 * u, top: 4 * u, width: 2.5 * u, height: 8 * u, backgroundColor: c}} />
      <View style={{position: 'absolute', left: 9.5 * u, top: 9.5 * u, width: 6 * u, height: 2.5 * u, backgroundColor: c}} />
    </View>
  );
}

type Tab = 'home' | 'library' | 'bookmarks' | 'settings';
function Taskbar({tab, onTab}: {tab: Tab; onTab: (t: Tab) => void}) {
  const items: {t: Tab; label: string}[] = [
    {t: 'home', label: 'Home'},
    {t: 'library', label: 'Library'},
    {t: 'bookmarks', label: 'Bookmarks'},
    {t: 'settings', label: 'Settings'},
  ];
  return (
    <View style={st.taskbar}>
      {items.map(({t, label}) => {
        const on = t === tab;
        const c = on ? '#ffffff' : BLACK;
        const sz = px(24);
        return (
          <Pressable key={t} onPress={() => onTab(t)} style={st.task} accessibilityRole="button" accessibilityLabel={label}>
            <View style={[st.taskIcon, on && st.btnDark]}>
              {t === 'home' ? <HomeIcon c={c} size={sz} /> : t === 'library' ? <ShelfIcon c={c} size={sz} /> : t === 'bookmarks' ? <RibbonIcon color={c} bg={on ? BLACK : '#ffffff'} size={sz} /> : <SlidersIcon c={c} size={sz} />}
            </View>
            <Text style={[st.taskText, on && {fontWeight: 'bold'}]}>{label}</Text>
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
  const c = BLACK;
  const o = on ? 1 : 0.55;
  return kind === 'list' ? (
    <View style={{opacity: o}}>
      {[0, 1, 2].map(i => <View key={i} style={{width: px(22), height: px(3), backgroundColor: c, marginVertical: px(2)}} />)}
    </View>
  ) : (
    <View style={{width: px(20), flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', opacity: o}}>
      {[0, 1, 2, 3].map(i => <View key={i} style={{width: px(8), height: px(8), backgroundColor: c, marginBottom: i < 2 ? px(3) : 0}} />)}
    </View>
  );
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
                {label: '‹ ›  Arrows', on: settings.paging === 'arrows', onPress: () => change({paging: 'arrows'})},
                {label: 'Scroll', on: settings.paging === 'scroll', onPress: () => change({paging: 'scroll'})},
              ]}
            />
            <Text style={st.tileLabel}>Long book pages</Text>
          </View>
          <View style={{flex: 1, alignItems: 'center', marginHorizontal: px(6)}}>
            <Seg
              options={[
                {label: 'Show', on: settings.showFilters, onPress: () => change({showFilters: true})},
                {label: 'Hide', on: !settings.showFilters, onPress: () => change({showFilters: false})},
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
          <RoundBtn label="Libraries" note="Add or remove" onPress={onLibraries}>
            <ShelfIcon c={BLACK} size={px(26)} />
          </RoundBtn>
          <RoundBtn label="Clear searches" note={`${counts.searches} saved`} onPress={onClearSearches} dim={!counts.searches}>
            <SearchIcon c={BLACK} size={px(26)} />
          </RoundBtn>
          <RoundBtn label="Clear history" note={`${counts.recent} recent`} onPress={onClearHistory} dim={!counts.recent}>
            <ClockIcon c={BLACK} size={px(26)} />
          </RoundBtn>
        </View>

        <Btn dark label="Done" onPress={onClose} style={{marginTop: px(20)}} />
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

function SnapList({items, empty, onOpen, onRemove}: {items: Snap[]; empty: string; onOpen: (x: Snap) => void; onRemove: (x: Snap) => void}) {
  const [pg, setPg] = useState(0);
  const rowH = px(122);
  const per = Math.max(1, Math.floor((H - px(64) - TASK_H - px(64) - px(10)) / rowH));
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(pg, pages - 1);
  if (!items.length) return <View style={[st.pad, {flex: 1}]}><Text style={st.para}>{empty}</Text></View>;
  return (
    <>
      <View style={{flex: 1, paddingHorizontal: px(14), paddingTop: px(4)}}>
        {items.slice(p * per, (p + 1) * per).map(x => (
          <SnapRow key={x.lib + x.key} x={x} h={rowH} onPress={() => onOpen(x)} right={<Btn small label="Remove" onPress={() => onRemove(x)} style={{marginLeft: px(8)}} />} />
        ))}
      </View>
      <View style={st.pager}>
        <Pressable disabled={p <= 0} onPress={() => setPg(p - 1)} style={[st.pageBtn, p <= 0 && st.dim]}><Text style={st.pageBtnText}>‹ Prev</Text></Pressable>
        <Text style={st.pageText}>{`${items.length} saved  ·  Page ${p + 1} of ${pages}`}</Text>
        <Pressable disabled={p >= pages - 1} onPress={() => setPg(p + 1)} style={[st.pageBtn, p >= pages - 1 && st.dim]}><Text style={st.pageBtnText}>Next ›</Text></Pressable>
      </View>
    </>
  );
}

// ---------- home ----------
type Found = {snap: Snap; book: Book; meta: Meta};
function Home(props: {
  libs: Lib[];
  lib: Lib | null;
  books: Book[];
  meta: MetaStore;
  app: AppState;
  paging: Settings['paging'];
  onSearched: (q: string) => void;
  onForgetSearch: (q: string) => void;
  onOpen: (x: Snap) => void;
  onLibrary: (l: Lib) => void;
  onAddLibrary: () => void;
}) {
  const {libs, lib, books, meta, app, onSearched, onForgetSearch, onOpen, onLibrary, onAddLibrary} = props;
  const [q, setQ] = useState('');
  const [index, setIndex] = useState<Found[] | null>(null);
  const [pg, setPg] = useState(0);
  const [, setTick] = useState(0);
  const covers = useRef<{[lib: string]: {[k: string]: string | null}}>({});

  // build a title index of every library the first time you search
  useEffect(() => {
    if (!q.trim() || index) return;
    let alive = true;
    (async () => {
      const all: Found[] = [];
      for (const l of libs) {
        const [bs, m] = l.path === lib?.path ? [books, meta] : await Promise.all([scanLibrary(l.path), loadMeta(l.path)]);
        for (const b of bs) {
          const bm = m.books[b.key] || {};
          all.push({book: b, meta: bm, snap: {lib: l.path, libName: l.name, key: b.key, title: bm.title || b.fileTitle, folder: b.folder, genres: bm.genres, at: 0}});
        }
      }
      if (alive) setIndex(all);
    })();
    return () => {
      alive = false;
    };
  }, [q, index, libs, lib, books, meta]);
  useEffect(() => setIndex(null), [libs, meta]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = (index || [])
    .filter(f => words.every(w => f.snap.title.toLowerCase().includes(w) || f.book.fileTitle.toLowerCase().includes(w)))
    .sort((a, b) => Number(!a.snap.title.toLowerCase().startsWith(words[0] || '')) - Number(!b.snap.title.toLowerCase().startsWith(words[0] || '')));
  const rowH = px(112);
  const listTop = px(64) + px(78);
  const per = Math.max(1, Math.floor((H - listTop - TASK_H - px(64) - px(30)) / rowH));
  const pages = Math.max(1, Math.ceil(found.length / per));
  const p = Math.min(pg, pages - 1);
  const shown = found.slice(p * per, (p + 1) * per);
  const coverOf = (f: Found) => f.meta.cover || covers.current[f.snap.lib]?.[f.book.key] || null;
  const sig = shown.map(f => f.snap.lib + f.book.key).join('|');
  useEffect(() => {
    let alive = true;
    (async () => {
      let changed = false;
      for (const f of shown) {
        const c = (covers.current[f.snap.lib] = covers.current[f.snap.lib] || {});
        if (f.book.key in c || f.meta.cover) continue;
        await coverFor(f.snap.lib, f.book, f.meta, c);
        changed = true;
      }
      if (alive && changed) setTick(t => t + 1);
    })();
    return () => {
      alive = false;
    };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = (
    <View style={st.searchRow}>
      <View style={st.searchBox}>
        <View style={{marginRight: px(10)}}><SearchIcon c={BLACK} size={px(22)} /></View>
        <TextInput
          style={st.searchInput}
          value={q}
          onChangeText={t => { setQ(t); setPg(0); }}
          placeholder="Search titles"
          placeholderTextColor="#777777"
          returnKeyType="search"
          onSubmitEditing={() => onSearched(q)}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={px(10)} accessibilityLabel="Clear search">
            <Text style={st.searchClear}>✕</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (q.trim()) {
    return (
      <View style={{flex: 1}}>
        {search}
        <Text style={[st.small, {paddingHorizontal: px(16), marginBottom: px(4)}]}>
          {index === null ? 'Searching your libraries…' : `${found.length} title${found.length === 1 ? '' : 's'} found`}
        </Text>
        <View style={{flex: 1, paddingHorizontal: px(14)}}>
          {shown.map(f => (
            <SnapRow key={f.snap.lib + f.book.key} x={f.snap} cover={coverOf(f)} h={rowH} onPress={() => { onSearched(q); onOpen(f.snap); }} />
          ))}
          {index !== null && !found.length ? <Text style={st.para}>No titles match. Try fewer words.</Text> : null}
        </View>
        {pages > 1 ? (
          <View style={st.pager}>
            <Pressable disabled={p <= 0} onPress={() => setPg(p - 1)} style={[st.pageBtn, p <= 0 && st.dim]}><Text style={st.pageBtnText}>‹ Prev</Text></Pressable>
            <Text style={st.pageText}>{`Page ${p + 1} of ${pages}`}</Text>
            <Pressable disabled={p >= pages - 1} onPress={() => setPg(p + 1)} style={[st.pageBtn, p >= pages - 1 && st.dim]}><Text style={st.pageBtnText}>Next ›</Text></Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  const perRow = 5;
  const cw = Math.floor((W - px(32) - (perRow - 1) * px(12)) / perRow);
  const recent = app.recent.slice(0, perRow * 2);
  return (
    <View style={{flex: 1}}>
      {search}
      <View style={{paddingHorizontal: px(16)}}>
        {app.searches.length ? (
          <>
            <Text style={st.homeLabel}>Recent searches</Text>
            <View style={[st.pillWrap, {height: px(40), overflow: 'hidden'}]}>
              {app.searches.map(t => (
                <View key={t} style={st.chip}>
                  <Pressable onPress={() => setQ(t)} hitSlop={px(4)}>
                    <Text style={st.chipText}>{t}</Text>
                  </Pressable>
                  <Pressable onPress={() => onForgetSearch(t)} hitSlop={px(8)} accessibilityLabel={`Forget ${t}`}>
                    <Text style={st.chipX}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {!libs.length ? (
          <View style={st.welcome}>
            <Text style={st.h2}>Welcome to InkShelf</Text>
            <Text style={[st.para, {fontSize: px(18)}]}>Pick a folder with your books (EPUB, PDF and more) and it becomes a library you can filter, search and bookmark.</Text>
            <Btn dark label="＋  Add your first library" onPress={onAddLibrary} />
          </View>
        ) : null}
        <Text style={[st.homeLabel, {marginTop: px(12)}]}>Recently read</Text>
        {recent.length ? (
          [0, 1].map(r =>
            recent.slice(r * perRow, (r + 1) * perRow).length ? (
              <View key={r} style={{flexDirection: 'row', marginBottom: px(10)}}>
                {recent.slice(r * perRow, (r + 1) * perRow).map((x, i) => (
                  <Pressable key={x.lib + x.key} onPress={() => onOpen(x)} style={{width: cw, marginLeft: i ? px(12) : 0}}>
                    <View>
                      <Cover uri={x.cover} w={cw} h={Math.round(cw * 1.5)} title={x.title} />
                      {x.vol ? <View style={st.volBadge}><Text style={st.volBadgeText}>{`Vol ${x.vol}`}</Text></View> : null}
                    </View>
                    <Text style={st.gridTitle} numberOfLines={2}>{x.title}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null,
          )
        ) : (
          <Text style={[st.small, {marginBottom: px(12)}]}>Books you open will show up here.</Text>
        )}

        <Text style={[st.homeLabel, {marginTop: px(6)}]}>Libraries</Text>
        <View style={st.pillWrap}>
          {libs.map(l => (
            <Pressable key={l.path} onPress={() => onLibrary(l)} style={st.libChip}>
              <ShelfIcon c={BLACK} size={px(20)} />
              <Text style={st.libChipText}>{l.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onAddLibrary} style={[st.libChip, {borderStyle: 'dashed'}]}>
            <Text style={st.libChipText}>＋ Add library</Text>
          </Pressable>
        </View>
      </View>
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
      <Header title="Choose a folder" left="‹ Cancel" onLeft={onCancel} />
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
              <Btn small label="‹ Up" onPress={() => onGo(isRoot ? null : parent)} />
              <Btn small dark label="✓  Use this folder" onPress={() => onPick(path)} style={{marginLeft: px(10), flex: 1}} />
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
          <Pressable disabled={pg <= 1} onPress={() => setPg(pg - 1)} style={[st.pageBtn, pg <= 1 && st.dim]}><Text style={st.pageBtnText}>‹ Prev</Text></Pressable>
          <Text style={st.pageText}>{`Page ${pg} of ${pages}`}</Text>
          <Pressable disabled={pg >= pages} onPress={() => setPg(pg + 1)} style={[st.pageBtn, pg >= pages && st.dim]}><Text style={st.pageBtnText}>Next ›</Text></Pressable>
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
        <Btn small label="Add" onPress={add} style={{marginLeft: px(8)}} />
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
      <Header title="Edit details" left="‹ Cancel" onLeft={onCancel} />
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
            <Btn small label="Choose an image…" onPress={async () => {
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
          label="Save"
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
  startBtn: {height: px(48), backgroundColor: BLACK, borderRadius: px(10), alignItems: 'center', justifyContent: 'center'},
  startText: {fontSize: px(18), fontWeight: 'bold', color: '#ffffff'},
  editBtn: {borderWidth: 1.5, borderColor: BLACK, borderRadius: px(20), paddingHorizontal: px(14), paddingVertical: px(5)},
  editText: {fontSize: px(17), color: BLACK},
  infoLabel: {fontSize: px(18), fontWeight: 'bold', color: BLACK, marginTop: px(4)},
  infoValue: {fontSize: px(17), lineHeight: px(24), color: BLACK},
  taskbar: {height: TASK_H, flexDirection: 'row', borderTopWidth: 2, borderColor: BLACK, backgroundColor: '#ffffff'},
  task: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  taskIcon: {width: px(52), height: px(36), borderRadius: px(18), alignItems: 'center', justifyContent: 'center'},
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
