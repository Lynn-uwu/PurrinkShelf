// The book sheet as a real Excel file (InkShelf books.xlsx): drop-down lists for categories,
// genres, tags, reading status and collections, so values are picked instead of typed again.
// Works in Excel, Google Sheets, Numbers and LibreOffice.

export type Sheet = {name: string; headers: string[]; rows: string[][]; widths?: number[]; lists?: {[header: string]: string}; hidden?: boolean};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export const col = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : col(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

function sheetXml(sh: Sheet, listCols: {[header: string]: string}): string {
  const cell = (v: string, r: number, c: number, s?: number) =>
    v === '' && s === undefined ? '' : `<c r="${col(c)}${r}" t="inlineStr"${s !== undefined ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const rows = [
    `<row r="1">${sh.headers.map((h, c) => cell(h, 1, c, 1)).join('')}</row>`,
    ...sh.rows.map((r, i) => `<row r="${i + 2}">${r.map((v, c) => cell(v || '', i + 2, c, sh.headers[c] === 'ID' ? 2 : undefined)).join('')}</row>`),
  ];
  const cols = (sh.widths || sh.headers.map(() => 16)).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  // a drop-down on every cell of a column; other values are still allowed (you can type a new tag)
  const dv = sh.headers
    .map((h, c) => {
      const src = listCols[h];
      if (!src) return '';
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="information" errorTitle="New value" error="This isn't in the list yet. It will be added." sqref="${col(c)}2:${col(c)}2000"><formula1>${src}</formula1></dataValidation>`;
    })
    .filter(Boolean);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" xSplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows.join('')}</sheetData>` +
    (dv.length ? `<dataValidations count="${dv.length}">${dv.join('')}</dataValidations>` : '') +
    '</worksheet>'
  );
}

/** Build the .xlsx files. `lists` become the Lists sheet; each column of it feeds a drop-down. */
export function makeWorkbook(sheets: Sheet[], lists: {name: string; values: string[]}[]): {[file: string]: string} {
  const listSheet: Sheet = {
    name: 'Lists',
    headers: lists.map(l => l.name),
    rows: Array.from({length: Math.max(1, ...lists.map(l => l.values.length))}, (_, i) => lists.map(l => l.values[i] || '')),
    widths: lists.map(() => 22),
  };
  const ref: {[name: string]: string} = {};
  lists.forEach((l, i) => (ref[l.name] = `Lists!$${col(i)}$2:$${col(i)}$1000`));
  const all = [...sheets, listSheet];
  const files: {[f: string]: string} = {};
  files['[Content_Types].xml'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    all.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';
  files['_rels/.rels'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files['xl/workbook.xml'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    all.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>';
  files['xl/_rels/workbook.xml.rels'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    all.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${all.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  files['xl/styles.xml'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="9"/><color rgb="FF999999"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F1EA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
  all.forEach((sh, i) => {
    const lc: {[h: string]: string} = {};
    Object.entries(sh.lists || {}).forEach(([h, list]) => ref[list] && (lc[h] = ref[list]));
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sh, lc);
  });
  return files;
}

// ---------- reading it back (whatever Excel / Google Sheets saved) ----------
const unesc = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
const texts = (xml: string) => (xml.match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g) || []).map(t => unesc(t.replace(/<t\b[^>]*\/>|<t\b[^>]*>|<\/t>/g, ''))).join('');
const colNum = (letters: string) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** {sheet name: rows of {header: value}} */
export function readWorkbook(files: {[f: string]: string}): {[sheet: string]: {[h: string]: string}[]} {
  const shared = (files['xl/sharedStrings.xml']?.match(/<si>[\s\S]*?<\/si>/g) || []).map(texts);
  const rels: {[id: string]: string} = {};
  for (const m of (files['xl/_rels/workbook.xml.rels'] || '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) rels[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const out: {[sheet: string]: {[h: string]: string}[]} = {};
  for (const m of (files['xl/workbook.xml'] || '').matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc(m[0].match(/name="([^"]+)"/)?.[1] || '');
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] || '';
    const xml = files['xl/' + (rels[rid] || '')];
    if (!xml) continue;
    const grid: string[][] = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = +(rm[0].match(/\br="(\d+)"/)?.[1] || grid.length + 1) - 1;
      const row: string[] = [];
      let auto = 0;
      for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
        const c = ref ? colNum(ref) : auto;
        auto = c + 1;
        const t = attrs.match(/\bt="([^"]+)"/)?.[1];
        const inner = cm[2] || '';
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        row[c] = t === 's' ? shared[+(v || 0)] || '' : t === 'inlineStr' ? texts(inner) : unesc(v || '');
      }
      grid[rn] = row;
    }
    const head = (grid[0] || []).map(h => (h || '').trim());
    out[name] = grid
      .slice(1)
      .filter(r => r && r.some(x => (x || '').trim()))
      .map(r => {
        const o: {[h: string]: string} = {};
        head.forEach((h, i) => h && (o[h] = (r[i] || '').trim()));
        return o;
      });
  }
  return out;
}
