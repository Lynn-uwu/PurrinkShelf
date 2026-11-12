import subprocess
from parts import *
designs = {}
# A: sitting cat, the tail curls into a fountain pen dripping ink (pic 1 idea, flower -> pen)
designs['A-ink-tail'] = svg(cat_sitting() + pen(112, 118, 304))
# B: the same cat with little book-page wings
designs['B-book-wings'] = svg(open_book_wings(232, 236, w=118, h=80, lift=32) + cat_sitting() + pen(112, 118, 304))
for n, s in designs.items():
    open(n + '.svg', 'w').write(s)
    subprocess.run(['rsvg-convert', n + '.svg', '-o', n + '.png'], check=True)
print(list(designs))
# C: pic 2 idea: a winged cat on a pen instead of a branch; the wings are open-book pages
c = page_wings(228, 196) + cat_side() + pen_between(70, 376, 352, 250) + sparkle(330, 84, 11) + '<path d="M352 132 q-9 13 0 19 q9 -6 0 -19 z" fill="#2b2b2b"/>'
open('C-winged-pen.svg', 'w').write(svg(c)); subprocess.run(['rsvg-convert', 'C-winged-pen.svg', '-o', 'C-winged-pen.png'], check=True)
c2 = page_fan_wing(232, 200) + cat_side() + pen_between(70, 376, 352, 250) + sparkle(330, 84, 11) + '<path d="M352 132 q-9 13 0 19 q9 -6 0 -19 z" fill="#2b2b2b"/>'
open('C2.svg', 'w').write(svg(c2)); subprocess.run(['rsvg-convert', 'C2.svg', '-o', 'C2.png'], check=True)
# C3: the winged cat with open-book wings (page block along the edge)
c3 = book_wing2(236, 198, rot=48, w=112, h=70) + book_wing2(240, 194, rot=18, w=124, h=74) + cat_side() + pen_between(70, 376, 352, 250) + sparkle(330, 84, 11) + '<path d="M352 132 q-9 13 0 19 q9 -6 0 -19 z" fill="#2b2b2b"/>'
open('C3.svg', 'w').write(svg(c3)); subprocess.run(['rsvg-convert', 'C3.svg', '-o', 'C3.png'], check=True)
# D: a cat peeking over an open book, a pen behind it with ink drops
d = pen_between(300, 300, 336, 90) + cat_reading()
open('D-reading.svg', 'w').write(svg(d)); subprocess.run(['rsvg-convert', 'D-reading.svg', '-o', 'D-reading.png'], check=True)
# E: badge: a cat head whose face is a pen nib (negative space), one ink drop below
head = "M86 330 Q70 200 120 150 L106 64 Q106 50 120 58 L186 104 Q200 100 214 104 L280 58 Q294 50 294 64 L280 150 Q330 200 314 330 Q300 350 200 350 Q100 350 86 330 Z"
nib = "M200 330 Q170 270 168 210 Q168 196 182 196 L218 196 Q232 196 232 210 Q230 270 200 330 Z"
e = (f'<path d="{head}" fill="{INK}"/><path d="{nib}" fill="{BG}"/><path d="M200 318 L200 250" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
     f'<circle cx="200" cy="244" r="7" fill="{INK}"/><ellipse cx="134" cy="232" rx="13" ry="16" fill="{BG}"/><ellipse cx="266" cy="232" rx="13" ry="16" fill="{BG}"/>'
     f'<path d="M200 362 q-9 13 0 19 q9 -6 0 -19 z" fill="{INK}" transform="translate(0 -6)"/>')
open('E-nib-face.svg', 'w').write(svg(e)); subprocess.run(['rsvg-convert', 'E-nib-face.svg', '-o', 'E-nib-face.png'], check=True)
