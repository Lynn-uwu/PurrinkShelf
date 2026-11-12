import subprocess, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'logo', 'cat'))
from cats import *
import parts  # pen(), the open-book wing
BG = '#dfe6df'
def wrap(inner): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" rx="80" fill="{BG}"/>{inner}</svg>'
def book(cx, y, w=150, ink=K, bg=BG):
    """an open book seen from the front, top edge at y"""
    return (f'<path d="M{cx} {y+10} C{cx-40} {y-6} {cx-100} {y-6} {cx-w} {y+4} L{cx-w} {y+52} C{cx-100} {y+44} {cx-40} {y+44} {cx} {y+60} '
            f'C{cx+40} {y+44} {cx+100} {y+44} {cx+w} {y+52} L{cx+w} {y+4} C{cx+100} {y-6} {cx+40} {y-6} {cx} {y+10} Z" fill="{ink}"/>'
            f'<path d="M{cx} {y+14} L{cx} {y+56}" stroke="{bg}" stroke-width="3"/>'
            + ''.join(f'<path d="M{cx+s*20} {y+yy} C{cx+s*60} {y+yy-10} {cx+s*100} {y+yy-10} {cx+s*(w-18)} {y+yy-4}" stroke="{bg}" stroke-width="3" fill="none" stroke-linecap="round"/>' for s in (-1, 1) for yy in (18, 30)))
def g(inner, x, y, s): return f'<g transform="translate({x} {y}) scale({s})">{inner}</g>'

out = {}
# 1: a mochi cat loafing on an open book; its tail ends in a pen nib dripping ink
nib_tail = (f'<path d="M262 250 C310 246 320 200 306 170" stroke="{K}" stroke-width="20" fill="none" stroke-linecap="round"/>'
            f'<g transform="translate(304 172) rotate(-14)"><path d="M-15 6 Q-16 -22 0 -50 Q16 -22 15 6 Z" fill="{K}"/>'
            f'<path d="M0 -44 L0 -14" stroke="{BG}" stroke-width="2.6" stroke-linecap="round"/><circle cy="-12" r="3.6" fill="{BG}"/></g>'
            f'<path d="M286 104 q-8 12 0 17 q8 -5 0 -17 z" fill="{K}"/><circle cx="270" cy="128" r="4" fill="{K}"/>')
body = (f'<path d="M110 262 C108 196 146 162 196 162 C246 162 284 196 282 262 Z" fill="{K}"/>' + ears(150, 242, 178, h=40) + face(196, 222, gap=28, size=1.6))
out['1-loaf-on-book'] = wrap(nib_tail + body + book(200, 252))
# 2: the mochi cat with open-book wings, a pen beside it
wings = parts.book_wing2(150, 214, rot=24, w=78, h=52) + f'<g transform="translate(252 214) scale(-1 1)">' + parts.book_wing2(0, 0, rot=24, w=78, h=52) + '</g>'
cat2 = g(sitting(), 82, 100, 1.2)
pen2 = parts.pen_between(56, 346, 352, 290)
out['2-book-wings'] = wrap(wings + cat2 + pen2)
# 3: peeking over the top of an open book, a pen tucked behind its ear
full = peek()
head_only = full[:full.index('<path d="M57 116')] if '<path d="M57 116' in full else full
paws = ''.join(f'<path d="M{x-15} 116 Q{x-17} 142 {x} 143 Q{x+17} 142 {x+15} 116 Z" fill="{K}" stroke="{BG}" stroke-width="3"/><path d="M{x-5} 132 l0 6 M{x+5} 132 l0 6" stroke="{W}" stroke-width="1.8" stroke-linecap="round"/>' for x in (72, 128))
cat3 = g(head_only, 70, 66, 1.3)
pen3 = f'<g transform="translate(298 92) rotate(32)">{parts.pen(0, 0, 150, w=12, ink=K, bg=BG)}</g>'
out['3-peek-book'] = wrap(pen3 + cat3 + book(200, 222, w=160) + g(paws, 70, 80, 1.3))
for n, s in out.items():
    open(n + '.svg', 'w').write(s); subprocess.run(['rsvg-convert', n + '.svg', '-o', n + '.png'], check=True)
from PIL import Image
c = Image.new('RGB', (1200, 400), 'white')
for i, n in enumerate(out): c.paste(Image.open(n + '.png'), (i * 400, 0))
c.save('logos.png')
