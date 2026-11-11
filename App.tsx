/**
 * InkShelf - a library for the Supernote.
 * Pick any folder as a library; books are listed by file name; add titles, tags,
 * descriptions and covers on the device; filter by folder and tag; tap to read.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {FileUtils, PluginManager, RattaFileSelector as FileSelector} from 'sn-plugin-lib';
import {Book, Lib, Meta, MetaStore, coverFor, loadLibraries, loadMeta, saveLibraries, saveMeta, scanLibrary} from './src/library';
import {Entry, hasNative, listDir, openBook} from './src/native';

const {width: W, height: H} = Dimensions.get('window');
const S = Math.min(W, H) / 702; // designed for a 702-wide screen, then scaled
const px = (n: number) => Math.round(n * S);
const BLACK = '#000000';
const LIST_PER_PAGE = 6;
const GRID_PER_PAGE = 12;
const READ = 'plugin.permission.FILE:READ';
const WRITE = 'plugin.permission.FILE:WRITE';

type Screen =
  | {kind: 'libraries'}
  | {kind: 'browse'; path: string | null}
  | {kind: 'library'}
  | {kind: 'book'; key: string}
  | {kind: 'edit'; key: string};
type TagState = {[t: string]: 1 | -1};

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

function Pill({label, onPress, active}: {label: string; onPress?: () => void; active?: boolean}) {
  return (
    <Pressable onPress={onPress} hitSlop={px(4)} style={[st.pill, active && st.pillActive]}>
      <Text style={[st.pillText, active && {color: '#ffffff'}]}>{label}</Text>
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
  const [screen, setScreen] = useState<Screen>({kind: 'libraries'});
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
  const [grid, setGrid] = useState(false);
  const [page, setPage] = useState(1);
  const [tPage, setTPage] = useState(1);
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    (async () => {
      await askPermissions();
      const l = await loadLibraries();
      setLibs(l);
      if (l.length === 1) openLibrary(l[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metaOf = (b: Book): Meta => meta.books[b.key] || {};
  const titleOf = (b: Book) => metaOf(b).title || b.fileTitle;

  async function openLibrary(l: Lib) {
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
    setScreen({kind: 'library'});
  }

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
  const allTags = useMemo(
    () => Array.from(new Set(books.flatMap(b => meta.books[b.key]?.tags || []))).sort((a, b) => a.localeCompare(b)),
    [books, meta],
  );
  const matches = (b: Book, fs: string[], ts: TagState, skip?: string) => {
    if (fs.length && !fs.includes(b.folder)) return false;
    const bt = meta.books[b.key]?.tags || [];
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

  // ----- list of libraries -----
  if (screen.kind === 'libraries') {
    return shell(
      <>
        <Header title="InkShelf" left={lib ? '‹ Back' : undefined} onLeft={lib ? () => setScreen({kind: 'library'}) : undefined} />
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
        onCancel={() => setScreen({kind: 'libraries'})}
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
    const m = metaOf(b);
    scheduleCovers([b]);
    const paras = (m.description || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    return shell(
      <>
        <Header title="" left="‹ Back" onLeft={() => setScreen({kind: 'library'})} />
        <ScrollView contentContainerStyle={st.pad}>
          <Text style={st.bookTitle}>{titleOf(b)}</Text>
          <View style={[st.pillWrap, {justifyContent: 'center'}]}>
            {b.folder ? <Pill label={b.folder} onPress={() => { setFolders([b.folder]); setTags({}); setPage(1); setScreen({kind: 'library'}); }} /> : null}
            {(m.tags || []).map(t => (
              <Pill key={t} label={t} active onPress={() => { setTags({[t]: 1}); setFolders([]); setPage(1); setScreen({kind: 'library'}); }} />
            ))}
          </View>
          <View style={{alignItems: 'center', marginVertical: px(14)}}>
            <Cover uri={coverUri(b)} w={px(200)} h={px(300)} title={titleOf(b)} />
          </View>
          <Btn dark label={b.vols.length ? '▶  Start reading (Vol ' + b.vols[0].n + ')' : '▶  Start reading'} onPress={() => read(b.files[0])} />
          <Btn label="✎  Edit title, tags, description, cover" onPress={() => setScreen({kind: 'edit', key: b.key})} style={{marginTop: px(10)}} />
          {paras.length ? paras.map((p, i) => <Text key={i} style={[st.para, i === 0 && {marginTop: px(14)}]}>{p}</Text>) : <Text style={[st.small, {marginTop: px(14)}]}>No description yet. Tap Edit to add one.</Text>}
          {b.vols.length > 0 && <Text style={st.h2}>{`${b.vols.length} volumes`}</Text>}
          {b.vols.map(v => (
            <Pressable key={v.path} style={st.vol} onPress={() => read(v.path)}>
              <Text style={st.volText}>{`▶  Vol ${v.n}`}</Text>
              {v.label ? <Text style={st.small}>{v.label.replace(/^\(|\)$/g, '')}</Text> : null}
            </Pressable>
          ))}
          <Text style={[st.small, {marginTop: px(16)}]} numberOfLines={3}>{b.files[0].replace(lib.path + '/', '')}</Text>
          <View style={{height: px(30)}} />
        </ScrollView>
      </>,
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
  const avail = H - px(64) - px(58) - px(64);
  const active = folders.length + Object.keys(tags).length;
  const folderCount = (f: string) => books.filter(b => b.folder === f && matches(b, [], tags)).length;
  const tagCount = (t: string) => books.filter(b => (meta.books[b.key]?.tags || []).includes(t) && matches(b, folders, tags, t)).length;
  const fixedTop = px(10) + px(36) + px(36) + Math.min(allFolders.length, 5) * px(40) + px(36) + px(40) + px(24);
  const perT = Math.max(4, Math.floor((H - px(64) - fixedTop - px(64)) / px(40)));
  const tPages = Math.max(1, Math.ceil(allTags.length / perT));
  const tp = Math.min(tPage, tPages);
  const tagChunk = allTags.slice((tp - 1) * perT, tp * perT);
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
                const all = [...(b.folder ? [b.folder] : []), ...(m.tags || [])];
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
                    {shown.map((t, i) => <Pill key={t + i} label={t} active={(i > 0 || !b.folder) && tags[t] === 1} />)}
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
              <Text style={st.section}>Tags</Text>
              {allTags.length === 0 ? (
                <Text style={st.hint}>No tags yet. Open a book and tap Edit to add tags.</Text>
              ) : (
                <>
                  <View style={st.modeRow}>
                    <Text style={st.small}>Match </Text>
                    <Pill label="All" active={mode === 'all'} onPress={() => { setMode('all'); setPage(1); }} />
                    <Pill label="Any" active={mode === 'any'} onPress={() => { setMode('any'); setPage(1); }} />
                  </View>
                  <Text style={st.hint}>Tap once to include, again to exclude.</Text>
                  <View style={{flex: 1}}>
                    {tagChunk.map(t => <FilterRow key={t} label={t} count={tagCount(t)} state={tags[t] || 0} onPress={() => cycleTag(t)} />)}
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
    </>,
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
function EditPage({book, meta, allTags, cover, onSave, onCancel}: {book: Book; meta: Meta; allTags: string[]; cover: string | null; onSave: (m: Meta) => void; onCancel: () => void}) {
  const [title, setTitle] = useState(meta.title || book.fileTitle);
  const [tags, setTags] = useState<string[]>(meta.tags || []);
  const [newTag, setNewTag] = useState('');
  const [desc, setDesc] = useState(meta.description || '');
  const [img, setImg] = useState<string | undefined>(meta.cover);
  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag('');
  };
  const suggestions = allTags.filter(t => !tags.includes(t));
  return (
    <>
      <Header title="Edit details" left="‹ Cancel" onLeft={onCancel} />
      <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
        <Text style={st.label}>Title</Text>
        <TextInput style={st.input} value={title} onChangeText={setTitle} />
        <Text style={st.small}>{`File name: ${book.fileTitle}`}</Text>

        <Text style={st.label}>Tags</Text>
        <View style={st.pillWrap}>
          {tags.map(t => <Pill key={t} label={`${t}  ✕`} active onPress={() => setTags(tags.filter(x => x !== t))} />)}
          {!tags.length && <Text style={st.small}>No tags yet.</Text>}
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <TextInput style={[st.input, {flex: 1}]} value={newTag} onChangeText={setNewTag} placeholder="New tag, e.g. Romance" onSubmitEditing={addTag} />
          <Btn small label="Add" onPress={addTag} style={{marginLeft: px(8)}} />
        </View>
        {suggestions.length > 0 && (
          <>
            <Text style={st.small}>Tap to add a tag you've used before:</Text>
            <View style={st.pillWrap}>{suggestions.map(t => <Pill key={t} label={`+ ${t}`} onPress={() => setTags([...tags, t])} />)}</View>
          </>
        )}

        <Text style={st.label}>Description</Text>
        <TextInput style={[st.input, {minHeight: px(180), textAlignVertical: 'top'}]} value={desc} onChangeText={setDesc} multiline placeholder="What's this book about?" />

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

        <Btn dark label="Save" onPress={() => onSave({title: title.trim() && title.trim() !== book.fileTitle ? title.trim() : undefined, tags, description: desc.trim() || undefined, cover: img})} style={{marginTop: px(24)}} />
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
  bookTitle: {fontSize: px(30), fontWeight: 'bold', color: BLACK, textAlign: 'center', marginBottom: px(12)},
  vol: {borderWidth: 2, borderColor: BLACK, borderRadius: px(10), paddingVertical: px(18), paddingHorizontal: px(16), marginBottom: px(14)},
  volText: {fontSize: px(22), fontWeight: 'bold', color: BLACK},
  overlay: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.88)', justifyContent: 'center', padding: px(40)},
  dialog: {backgroundColor: '#ffffff', borderWidth: 3, borderColor: BLACK, borderRadius: px(14), padding: px(24)},
});
