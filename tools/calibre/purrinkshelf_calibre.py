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


def apply_changes(lib, changes_path, gcol, dry):
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
    rev = {'Chinese': 'zho', 'Korean': 'kor', 'Japanese': 'jpn', 'English': 'eng', 'Spanish': 'spa', 'French': 'fra', 'German': 'deu'}
    done = 0
    for r in rows:
        bid, field, value = r.get('calibre_id', ''), r.get('field', ''), r.get('value', '')
        if not bid or field not in FIELDS:
            continue
        if field == 'title':
            arg = f'title:{value}'
        elif field == 'author':
            arg = f'authors:{value}'
        elif field == 'description':
            arg = f'comments:{value}'
        elif field == 'tags':
            arg = 'tags:' + ', '.join(x.strip() for x in value.split(';') if x.strip())
        elif field == 'language':
            arg = f'languages:{rev.get(value, value)}'
        elif field == 'series':
            name, _, num = value.rpartition(' #') if ' #' in value else (value, '', '')
            args = [f'series:{name}'] + ([f'series_index:{num}'] if num else [])
            done += run(exe, lib, bid, args, r.get('title', ''), field, dry)
            continue
        elif field == 'genres':
            if not gcol:
                print(f'  skipped genres for "{r.get("title", bid)}": make a custom column "genre" in Calibre first')
                continue
            arg = f'#{gcol[1]}:' + ', '.join(x.strip() for x in value.split(';') if x.strip())
        done += run(exe, lib, bid, [arg], r.get('title', ''), field, dry)
    if not dry:
        os.replace(changes_path, changes_path.replace('.csv', f'.done-{time.strftime("%Y%m%d-%H%M%S")}.csv'))
    return done


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
    _, gcol = read_calibre(lib)
    n = apply_changes(lib, os.path.join(data, 'supernote-changes.csv'), gcol, dry)
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
