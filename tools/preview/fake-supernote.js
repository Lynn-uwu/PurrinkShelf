// A pretend Supernote for previews: a small fake SD card with demo books,
// plus stand-ins for the plugin kit and InkShelf's native module.
// All titles and covers here are made up for testing.
import {NativeModules} from 'react-native-web';

const SD = '/storage/ABCD-1234';
const tree = {
  [`${SD}`]: ['Novels/', 'Books/', 'Music/'],
  '/storage/emulated/0': ['Document/', 'Note/', 'MyStyle/'],
  '/storage/emulated/0/Document': ['Welcome.pdf'],
  [`${SD}/Books`]: ['Garden Notes.epub'],
  [`${SD}/Music`]: [],
  [`${SD}/Novels`]: ['Chinese Novels/', 'Korean Novels/', '_Library Data/'],
  [`${SD}/Novels/Korean Novels`]: ['The Lighthouse Keeper - Min Seo.epub', 'Rain Over Busan.epub'],
  [`${SD}/Novels/Chinese Novels`]: [
    'Moon Over the Jade Pavilion.epub', 'The Tea House on Willow Street.epub', 'A Sword Without a Name.epub',
    'Paper Lanterns in Winter.epub', 'The Fox Who Kept the Library.epub', 'Ten Thousand Steps to the Summit.epub',
    'Starlight Courier.epub', 'The Quiet Alchemist.epub', 'River of Small Lights.epub', 'Crane and the Clockmaker.epub',
    'Echoes of the Ninth Gate/',
  ],
  [`${SD}/Novels/Chinese Novels/Echoes of the Ninth Gate`]: [
    'Echoes of the Ninth Gate Vol 1 (Ch 1-40).epub', 'Echoes of the Ninth Gate Vol 2 (Ch 41-82).epub',
    'Echoes of the Ninth Gate Vol 3 (Ch 83-120).epub',
  ],
};
const files = {};
const meta = {
  version: 1,
  books: {
    'Chinese Novels/Moon Over the Jade Pavilion.epub': {tags: ['Romance', 'Historical', 'Slow Burn'], description: 'A palace archivist finds a letter that was never meant to be opened, and a prince who would rather it stayed hidden.\nSlow, gentle and full of rainy courtyards.'},
    'Chinese Novels/The Tea House on Willow Street.epub': {tags: ['Slice of Life', 'Comedy'], description: 'A retired general opens a tiny tea house and tries very hard to live a quiet life. The neighbours have other plans.'},
    'Chinese Novels/A Sword Without a Name.epub': {tags: ['Action', 'Fantasy', 'Martial Arts'], description: 'An apprentice inherits a blade that refuses to be named, and every sect in the land wants to know why.'},
    'Chinese Novels/Echoes of the Ninth Gate/Echoes of the Ninth Gate#vols': {title: 'Echoes of the Ninth Gate', tags: ['Fantasy', 'Mystery', 'Romance'], description: 'Two rival exorcists are bound by a contract neither remembers signing. Nine gates, nine debts, one very long road.'},
    'Korean Novels/Rain Over Busan.epub': {tags: ['Romance', 'Drama'], description: 'A weather forecaster who is always wrong meets a photographer who only shoots storms.'},
    'Chinese Novels/Starlight Courier.epub': {tags: ['Sci-fi', 'Comedy'], description: 'The galaxy\'s most punctual delivery driver is assigned a parcel that keeps trying to escape.'},
  },
};
const COLORS = ['#c9d6df', '#f2d7b6', '#d8c7e8', '#cfe3c5', '#f0c9c9', '#c7dbe8', '#e8e2c7'];
function svgCover(title) {
  let h = 0; for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const c = COLORS[Math.abs(h) % COLORS.length];
  const words = title.replace(/\.epub$/, '').split(' ');
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 12) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  lines.push(cur.trim());
  const text = lines.slice(0, 5).map((l, i) => `<text x="200" y="${230 + i * 46}" font-size="38" text-anchor="middle" font-family="Georgia" fill="#222">${l}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="${c}"/><circle cx="200" cy="120" r="50" fill="none" stroke="#222" stroke-width="4"/><rect x="30" y="30" width="340" height="540" fill="none" stroke="#222" stroke-width="3"/>${text}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

window.__opened = [];
NativeModules.InkShelf = {
  listDir: async path => (tree[path] || []).map(n => ({name: n.replace(/\/$/, ''), path: `${path}/${n.replace(/\/$/, '')}`, isDir: n.endsWith('/'), size: 1000})),
  readText: async path => (path.endsWith('/.inkshelf/library.json') ? JSON.stringify(meta) : path.endsWith('libraries.json') ? (window.__libs || null) : files[path] || null),
  writeText: async (path, text) => { files[path] = text; if (path.endsWith('libraries.json')) window.__libs = text; return true; },
  extractEpubCover: async epub => (/Paper Lanterns|Crane/.test(epub) ? null : svgCover(epub.split('/').pop())),
  openDocument: async (path, how) => { window.__opened.push(how + ':' + path); return true; },
};
if (new URLSearchParams(location.search).get('lib')) {
  window.__libs = JSON.stringify([{name: 'Novels', path: `${SD}/Novels`}, {name: 'Books', path: `${SD}/Books`}].slice(0, Number(new URLSearchParams(location.search).get('lib'))));
}

export const PluginManager = {
  init() {}, registerButton() {}, closePluginView: async () => { window.__closed = 1; return true; },
  hasPermission: async () => true, requestPermission: async () => 2, getPluginDirPath: async () => '/plugin',
};
export const FileUtils = {exists: async () => true, getExternalDirPath: async () => ['/storage/emulated/0', SD]};
export const PluginFileAPI = {openFile: async () => ({success: true, result: true})};
export const RattaFileSelector = {selectImage: async () => null};
