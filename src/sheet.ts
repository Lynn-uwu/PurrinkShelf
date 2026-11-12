// A spreadsheet of every book (Document/PurrinkShelf/PurrinkShelf books.csv) to fill in on a computer.
export const SHEET_NAME = 'PurrinkShelf books.csv';
export const COLUMNS = ['Title', 'Library', 'Folder', 'File', 'Categories', 'Genres', 'Tags', 'Language', 'Status', 'Completely translated', 'Reading', 'Favourite', 'Description', 'ID'] as const;
export type Row = {[k in (typeof COLUMNS)[number]]?: string};

const cell = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => cell(r[c] || '')).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n'; // the mark at the start lets Excel read accents and Chinese/Korean titles
}

/** reads what Excel, Numbers, LibreOffice or Google Sheets saved (commas or semicolons) */
export function parseCsv(text: string): Row[] {
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
  const head = out[0].map(h => h.trim().toLowerCase());
  return out.slice(1).map(r => {
    const o: Row = {};
    COLUMNS.forEach(c => {
      const i = head.indexOf(c.toLowerCase());
      if (i >= 0) o[c] = (r[i] || '').trim();
    });
    return o;
  });
}
export const list = (v: string) => v.split(/[;,]/).map(x => x.trim()).filter(Boolean);
