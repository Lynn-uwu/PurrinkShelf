// Goodreads and StoryGraph: read their export files, and write one they can import.
// Goodreads: My Books › Import and export › Export library (goodreads_library_export.csv)
// StoryGraph: Manage account › Export StoryGraph library (a .csv)

export type SiteRow = {
  site: 'Goodreads' | 'StoryGraph';
  title: string;
  author?: string;
  state?: 'plan' | 'reading' | 'completed' | 'dropped' | 'hold';
  read?: number; // date finished (ms)
  rating?: number; // 1–5
  review?: string;
  warnings: string[];
  tags: string[];
};

/** a CSV as rows of {header: value} (commas or semicolons, quotes, line breaks inside quotes) */
export function parseTable(text: string): {[h: string]: string}[] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim())) out.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(x => x.trim())) out.push(row);
  if (!out.length) return [];
  const head = out[0].map(h => h.trim());
  return out.slice(1).map(r => {
    const o: {[h: string]: string} = {};
    head.forEach((h, i) => (o[h] = (r[i] || '').trim()));
    return o;
  });
}

const day = (v?: string) => {
  if (!v) return undefined;
  const m = v.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 12) : undefined;
};
const clean = (v?: string) => (v || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const list = (v?: string) => (v || '').split(/[,;]/).map(x => x.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
/** "The Name of the Wind (The Kingkiller Chronicle, #1)" -> "The Name of the Wind" */
export const bareTitle = (t: string) => t.replace(/\s*\([^)]*#\s*[\d.]+\)\s*$/, '').trim();

/** which site wrote the file, and its rows in one shape; null when it's neither */
export function readSiteExport(text: string): SiteRow[] | null {
  const rows = parseTable(text);
  if (!rows.length) return null;
  const h = Object.keys(rows[0]);
  if (h.includes('Exclusive Shelf') || h.includes('My Rating')) {
    return rows.filter(r => r.Title).map(r => {
      const shelf = (r['Exclusive Shelf'] || '').toLowerCase();
      const rating = Number(r['My Rating']) || undefined;
      return {
        site: 'Goodreads' as const,
        title: r.Title,
        author: r.Author || undefined,
        state: shelf === 'read' ? 'completed' : shelf === 'currently-reading' ? 'reading' : shelf === 'to-read' ? 'plan' : undefined,
        read: day(r['Date Read']),
        rating: rating && rating > 0 ? rating : undefined,
        review: clean(r['My Review']) || undefined,
        warnings: [],
        tags: list(r.Bookshelves).filter(s => !['read', 'currently-reading', 'to-read', 'favorites'].includes(s.toLowerCase())),
      };
    });
  }
  if (h.includes('Read Status') || h.includes('Star Rating')) {
    return rows.filter(r => r.Title).map(r => {
      const s = (r['Read Status'] || '').toLowerCase();
      const rating = Number(r['Star Rating']) || undefined;
      return {
        site: 'StoryGraph' as const,
        title: r.Title,
        author: (r.Authors || '').split(',')[0].trim() || undefined,
        state: s === 'read' ? 'completed' : s === 'currently-reading' ? 'reading' : s === 'to-read' ? 'plan' : s === 'did-not-finish' ? 'dropped' : s === 'paused' ? 'hold' : undefined,
        read: day(r['Last Date Read']),
        rating: rating ? Math.max(1, Math.min(5, Math.round(rating))) : undefined,
        review: clean(r.Review) || undefined,
        warnings: list(r['Content Warnings']),
        tags: list(r.Tags),
      };
    });
  }
  return null;
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const ymd = (ms?: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};
/** a file in Goodreads' own export layout: Goodreads and StoryGraph both import it */
export function goodreadsCsv(books: {title: string; author?: string; rating?: number; read?: number; added?: number; shelf: string; review?: string; shelves: string[]}[]): string {
  const head = ['Title', 'Author', 'ISBN', 'My Rating', 'Average Rating', 'Publisher', 'Binding', 'Year Published', 'Original Publication Year', 'Date Read', 'Date Added', 'Bookshelves', 'Exclusive Shelf', 'My Review'];
  const lines = books.map(b =>
    [b.title, b.author || '', '', b.rating ? String(Math.round(b.rating)) : '0', '', '', '', '', '', ymd(b.read), ymd(b.added), b.shelves.join(', '), b.shelf, b.review || ''].map(cell).join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
}
