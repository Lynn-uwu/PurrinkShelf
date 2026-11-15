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

/** a work downloaded from Archive of Our Own: its first page lists the tags (Rating, Fandom, Relationship…) */
export type Ao3Work = {
  url?: string; rating?: string; warnings: string[]; categories: string[]; fandoms: string[]; ships: string[]; characters: string[]; tags: string[];
  words?: number; chapters?: string; complete?: boolean; author?: string; summary?: string; language?: string; series?: string; seriesNo?: number;
};
export function parseAo3(html: string): Ao3Work | null {
  if (!/archiveofourown\.org|Archive of Our Own/i.test(html)) return null;
  const un = (t: string) => t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
  const dd: {[k: string]: string} = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) dd[un(m[1]).replace(/:$/, '').toLowerCase()] = m[2];
  // each tag is a link; without links, split on commas
  const list = (k: string) => {
    const v = dd[k] || dd[k + 's'];
    if (!v) return [];
    const links = Array.from(v.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)).map(m => un(m[1])).filter(Boolean);
    return links.length ? links : un(v).split(/\s*,\s*/).filter(Boolean);
  };
  const stats = un(dd.stats || '');
  const num = (k: string) => { const m = stats.match(new RegExp(`${k}:\\s*([\\d,]+)`, 'i')); return m ? Number(m[1].replace(/,/g, '')) : undefined; };
  const ch = stats.match(/Chapters:\s*(\d+\s*\/\s*(?:\d+|\?))/i)?.[1]?.replace(/\s/g, '');
  const url = html.match(/https?:\/\/(?:www\.)?archiveofourown\.org\/works\/\d+/i)?.[0];
  const author = html.match(/class="byline"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const summary = html.match(/<p[^>]*>\s*Summary\s*<\/p>\s*<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i)?.[1];
  const series = un(dd.series || '').match(/Part\s+(\d+)\s+of\s+(.+)$/i);
  const w: Ao3Work = {
    url, rating: list('rating')[0], warnings: list('archive warning'), categories: list('category'), fandoms: list('fandom'),
    ships: list('relationship'), characters: list('character'), tags: list('additional tags'),
    words: num('words'), chapters: ch, complete: ch ? /^(\d+)\/\1$/.test(ch) : undefined,
    author: author ? un(author).replace(/^by\s+/i, '') : undefined,
    summary: summary ? summary.replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : undefined,
    language: un(dd.language || '') || undefined,
    series: series ? series[2].trim() : undefined, seriesNo: series ? Number(series[1]) : undefined,
  };
  if (!w.fandoms.length && !w.rating && !w.url) return null;
  return w;
}
