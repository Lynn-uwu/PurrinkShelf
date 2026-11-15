#!/usr/bin/env python3
"""
PurrinkShelf <-> Calibre helper. Runs on the computer that has Calibre.

    python purrinkshelf_calibre.py "C:\\Users\\you\\Calibre Library" "C:\\...\\Supernote\\Novels"

What it does, in order:
  1. Reads "_Library Data/supernote-changes.csv" (written by PurrinkShelf) and puts those
     changes into Calibre with calibredb (Calibre's own command line tool). Calibre's
     database is never edited directly.
  2. Reads Calibre's metadata.db (read only) and writes "_Library Data/calibre.csv"
     in the Supernote library folder. PurrinkShelf reads it the next time it opens:
     a change made in only one place is taken over by itself; a field changed in
     both places is shown to you to choose.

New books: books PurrinkShelf has that Calibre doesn't are added (the setting "Send new books to
Calibre" in PurrinkShelf). A book in volumes becomes one Calibre book per volume, in a series named
after the book. This happens on the run after PurrinkShelf has read calibre.csv once.

Close Calibre before running it (calibredb can't write while Calibre is open).
Genres come from a Calibre custom column named "genre" or "genres" (#genre), if you have one.
Options:
  --dry-run   show what would change in Calibre, change nothing
"""
import csv
import os
import shutil
import sqlite3
import subprocess
import sys
import time

FIELDS = ['title', 'author', 'description', 'genres', 'tags', 'series', 'language']


def find_calibredb():
    exe = shutil.which('calibredb')
    if exe:
        return exe
    for p in [r'C:\Program Files\Calibre2\calibredb.exe', r'C:\Program Files (x86)\Calibre2\calibredb.exe',
              '/Applications/calibre.app/Contents/MacOS/calibredb', '/usr/bin/calibredb']:
        if os.path.exists(p):
            return p
    return None


def genre_column(db):
    for cid, label, multiple in db.execute("SELECT id, label, is_multiple FROM custom_columns"):
        if label.lower() in ('genre', 'genres'):
            return cid, label, bool(multiple)
    return None


def read_calibre(lib):
    path = os.path.join(lib, 'metadata.db')
    db = sqlite3.connect('file:' + path.replace('\\', '/') + '?mode=ro', uri=True)
    q = lambda sql, *a: db.execute(sql, a).fetchall()
    gcol = genre_column(db)
    langs = {'zho': 'Chinese', 'kor': 'Korean', 'jpn': 'Japanese', 'eng': 'English', 'spa': 'Spanish', 'fra': 'French',
             'deu': 'German', 'ind': 'Indonesian', 'vie': 'Vietnamese', 'tha': 'Thai', 'rus': 'Russian', 'por': 'Portuguese'}
    out = []
    for bid, title, sidx, bpath in q("SELECT id, title, series_index, path FROM books ORDER BY id"):
        authors = [r[0] for r in q("SELECT a.name FROM authors a JOIN books_authors_link l ON l.author=a.id WHERE l.book=? ORDER BY l.id", bid)]
        comments = q("SELECT text FROM comments WHERE book=?", bid)
        tags = [r[0] for r in q("SELECT t.name FROM tags t JOIN books_tags_link l ON l.tag=t.id WHERE l.book=? ORDER BY t.name", bid)]
        series = q("SELECT s.name FROM series s JOIN books_series_link l ON l.series=s.id WHERE l.book=?", bid)
        lang = q("SELECT g.lang_code FROM languages g JOIN books_languages_link l ON l.lang_code=g.id WHERE l.book=? ORDER BY l.item_order", bid)
        genres = []
        if gcol:
            cid, _, multiple = gcol
            genres = [r[0] for r in q(f"SELECT c.value FROM custom_column_{cid} c JOIN books_custom_column_{cid}_link l ON l.value=c.id WHERE l.book=? ORDER BY c.value", bid)]
        files = [f"{n}.{fmt.lower()}" for fmt, n in q("SELECT format, name FROM data WHERE book=?", bid)]
        desc = comments[0][0] if comments else ''
        desc = strip_html(desc)
        out.append({
            'calibre_id': str(bid), 'title': title, 'author': ' & '.join(authors), 'description': desc,
            'genres': '; '.join(genres), 'tags': '; '.join(tags),
            'series': f"{series[0][0]} #{('%g' % sidx)}" if series else '',
            'language': langs.get(lang[0][0], lang[0][0]) if lang else '',
            'files': '; '.join(files),
        })
    db.close()
    return out, gcol


def strip_html(t):
    import re
    import html
    t = re.sub(r'</p>\s*<p[^>]*>|<br\s*/?>', '\n', t or '', flags=re.I)
    t = re.sub(r'<[^>]+>', '', t)
    return html.unescape(t).strip()


def apply_changes(lib, sn, changes_path, gcol, books, dry):
    if not os.path.exists(changes_path):
        return 0
    with open(changes_path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return 0
    exe = find_calibredb()
    if not exe and not dry:
        print('calibredb was not found. Is Calibre installed? Changes from the Supernote were not applied.')
        return 0
    # volumes of one book share its title and a series of the same name: details go to all of them
    by_id = {b['calibre_id']: b for b in books}
    def siblings(bid):
        b = by_id.get(bid)
        if not b or not b['series'].startswith(b['title'] + ' #'):
            return [bid]
        return [x['calibre_id'] for x in books if x['title'] == b['title'] and x['series'].startswith(b['title'] + ' #')]
    titles = {b['title'].strip().lower() for b in books}
    groups = {}
    for r in rows:
        groups.setdefault(r.get('calibre_id', ''), []).append(r)
    done = 0
    for bid, rs in groups.items():
        if not bid:
            continue
        if bid.startswith('new:'):
            add = next((r for r in rs if r.get('field') == 'add'), None)
            if not add:
                continue
            title = add.get('title', '')
            if title.strip().lower() in titles:
                print(f'  "{title}" is already in Calibre: not added again')
                continue
            paths = [p for p in add.get('value', '').split('|') if p]
            ids = []
            for i, rel in enumerate(paths):
                full = os.path.join(sn, *rel.split('/'))
                if not os.path.exists(full):
                    print(f'  not found on this computer, skipped: {rel}')
                    continue
                print(f'  {"would add" if dry else "add"} "{title}"{f" (volume {i + 1})" if len(paths) > 1 else ""}: {rel}')
                if dry:
                    ids.append(f'new{i}')
                    continue
                r = subprocess.run([exe, 'add', '--library-path', lib, full], capture_output=True, text=True)
                import re
                m = re.search(r'ids?:\s*([\d, ]+)', r.stdout or '')
                if r.returncode != 0 or not m:
                    print('    failed:', (r.stderr or r.stdout).strip()[:300])
                    continue
                ids.append(m.group(1).split(',')[0].strip())
            if not ids:
                continue
            titles.add(title.strip().lower())
            for k, nid in enumerate(ids):
                args = [field_arg('title', title, gcol)]
                for r in rs:
                    if r.get('field') in FIELDS and r.get('field') != 'title':
                        a = field_arg(r['field'], r.get('value', ''), gcol)
                        if a:
                            args += a if isinstance(a, list) else [a]
                if len(ids) > 1:
                    args += [f'series:{title}', f'series_index:{k + 1}']
                done += run(exe, lib, nid, args, title, 'details', dry)
            continue
        for r in rs:
            field, value = r.get('field', ''), r.get('value', '')
            if field not in FIELDS:
                continue
            a = field_arg(field, value, gcol)
            if not a:
                print(f'  skipped genres for "{r.get("title", bid)}": make a custom column "genre" in Calibre first')
                continue
            for target in (siblings(bid) if field not in ('series',) else [bid]):
                done += run(exe, lib, target, a if isinstance(a, list) else [a], r.get('title', ''), field, dry)
    if not dry:
        os.replace(changes_path, changes_path.replace('.csv', f'.done-{time.strftime("%Y%m%d-%H%M%S")}.csv'))
    return done


REV_LANG = {'Chinese': 'zho', 'Korean': 'kor', 'Japanese': 'jpn', 'English': 'eng', 'Spanish': 'spa', 'French': 'fra', 'German': 'deu'}


def field_arg(field, value, gcol):
    """calibredb --field text for one of PurrinkShelf's fields (a list for series)"""
    split = lambda v: ', '.join(x.strip() for x in v.split(';') if x.strip())
    if field == 'title':
        return f'title:{value}'
    if field == 'author':
        return f'authors:{value}'
    if field == 'description':
        return f'comments:{value}'
    if field == 'tags':
        return 'tags:' + split(value)
    if field == 'language':
        return f'languages:{REV_LANG.get(value, value)}'
    if field == 'series':
        name, _, num = value.rpartition(' #') if ' #' in value else (value, '', '')
        return [f'series:{name}'] + ([f'series_index:{num}'] if num else [])
    if field == 'genres':
        return f'#{gcol[1]}:' + split(value) if gcol else None
    return None


def run(exe, lib, bid, args, title, field, dry):
    print(f'  {"would set" if dry else "set"} {field} of "{title}" (Calibre id {bid})')
    if dry:
        return 1
    cmd = [exe, 'set_metadata', '--library-path', lib, bid]
    for a in args:
        cmd += ['--field', a]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('    failed:', (r.stderr or r.stdout).strip()[:300])
        return 0
    return 1


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    if len(args) != 2:
        print(__doc__)
        sys.exit(1)
    lib, sn = args
    if not os.path.exists(os.path.join(lib, 'metadata.db')):
        sys.exit(f'No metadata.db in {lib}: is that the Calibre library folder?')
    data = os.path.join(sn, '_Library Data')
    os.makedirs(data, exist_ok=True)
    before, gcol = read_calibre(lib)
    n = apply_changes(lib, sn, os.path.join(data, 'supernote-changes.csv'), gcol, before, dry)
    print(f'{n} change(s) from the Supernote {"would be " if dry else ""}put into Calibre.')
    rows, _ = read_calibre(lib)
    out = os.path.join(data, 'calibre.csv')
    if not dry:
        with open(out, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['calibre_id'] + FIELDS + ['files'])
            w.writeheader()
            w.writerows(rows)
    print(f'{len(rows)} Calibre book(s) {"would be " if dry else ""}written to {out}. Open PurrinkShelf to sync.')


if __name__ == '__main__':
    main()
