# Shared shapes for the cat logo concepts (original drawings, 400x400 canvas)
INK = '#2b2b2b'
BG = '#dfe6df'
def cat_sitting(dx=0, dy=0, s=1.0, ink=INK, eyes=True):
    body = ("M168 128 L169 70 Q170 60 179 66 L206 96 Q226 90 246 96 L274 66 Q283 58 284 70 L284 130 "
            "Q300 170 300 200 Q350 230 352 300 Q354 348 312 350 "
            "L120 350 Q96 350 92 330 Q88 304 110 300 Q130 298 130 316 Q128 330 118 330 Q138 336 168 330 Z")
    face = ''
    if eyes:
        face = ('<ellipse cx="208" cy="142" rx="11" ry="13" fill="#fff"/><ellipse cx="252" cy="142" rx="11" ry="13" fill="#fff"/>'
                f'<circle cx="211" cy="145" r="5" fill="{ink}"/><circle cx="249" cy="145" r="5" fill="{ink}"/>'
                '<path d="M224 162 l6 6 l6 -6 z" fill="#fff"/>')
    return f'<g transform="translate({dx} {dy}) scale({s})"><path d="{body}" fill="{ink}"/>{face}</g>'

def pen(x, top, bottom, w=12, ink=INK, bg=BG, drop=True):
    """an upright fountain pen: barrel, ring, nib pointing up with slit and breather hole, and an ink drop"""
    nibH = 52
    nb = top + nibH  # nib base
    p = [f'<rect x="{x-w/2}" y="{nb+6}" width="{w}" height="{bottom-nb-6}" rx="{w/2}" fill="{ink}"/>',
         f'<rect x="{x-w/2-3}" y="{nb}" width="{w+6}" height="10" rx="3" fill="{ink}"/>',
         # nib: shoulders, tapering to the point
         f'<path d="M{x-14} {nb} Q{x-15} {nb-22} {x} {top} Q{x+15} {nb-22} {x+14} {nb} Z" fill="{ink}"/>',
         f'<path d="M{x} {top+6} L{x} {nb-14}" stroke="{bg}" stroke-width="2.4" stroke-linecap="round"/>',
         f'<circle cx="{x}" cy="{nb-12}" r="3.6" fill="{bg}"/>']
    if drop:
        # ink falling from the tip, and two splashes
        p.append(f'<path d="M{x-16} {top-16} q-8 12 0 17 q8 -5 0 -17 z" fill="{ink}"/>')
        p.append(f'<circle cx="{x-30}" cy="{top+16}" r="4" fill="{ink}"/><circle cx="{x-22}" cy="{top+34}" r="2.6" fill="{ink}"/>')
    return ''.join(p)

def book_wing(cx, cy, scale=1.0, flip=False, ink=INK, bg=BG, rot=0, pages=((128, -30), (118, -8), (104, 14), (88, 36))):
    """a wing made of book pages fanning out from the shoulder, like pages being flipped: curved strips with square page ends"""
    sx = -scale if flip else scale
    out = [f'<g transform="translate({cx} {cy}) rotate({rot}) scale({sx} {scale})">']
    for L, ang in pages:
        w = 18
        out.append(f'<g transform="rotate({ang})"><path d="M0 0 C{L*0.25} -{L*0.32} {L*0.55} -{L*0.42} {L} -{L*0.36} L{L+2} -{L*0.36-w} C{L*0.55} -{L*0.42+w*0.9} {L*0.2} -{L*0.32+w*0.6} -6 -{w*0.5} Z" fill="{ink}"/></g>')
    # the book's spine at the shoulder
    out.append(f'<circle r="16" fill="{ink}"/></g>')
    return ''.join(out)

def svg(inner, bg=BG, rx=80):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" rx="{rx}" fill="{bg}"/>{inner}</svg>'

def open_book_wings(cx, cy, w=120, h=78, rot=0, ink=INK, bg=BG, lines=3, lift=0):
    """one open book behind the cat: its two halves are the wings, with page lines"""
    half = lambda sgn: (f'M0 0 C{sgn*w*0.3} -{h*0.28} {sgn*w*0.7} -{h*0.3} {sgn*w} -{h*0.16} '
                        f'L{sgn*w*1.02} -{h} C{sgn*w*0.7} -{h*1.12} {sgn*w*0.3} -{h*1.1} 0 -{h*0.82} Z')
    out = [f'<g transform="translate({cx} {cy}) rotate({rot})">']
    for sgn in (-1, 1):
        out.append(f'<g transform="rotate({-sgn*lift})"><path d="{half(sgn)}" fill="{ink}"/>')
        for k in range(1, lines + 1):
            y0 = h * (0.32 + k * 0.17)
            out.append(f'<path d="M{sgn*w*0.18} -{y0} C{sgn*w*0.4} -{y0+h*0.12} {sgn*w*0.65} -{y0+h*0.12} {sgn*w*0.86} -{y0-h*0.02}" stroke="{bg}" stroke-width="3" fill="none" stroke-linecap="round"/>')
        out.append('</g>')
    out.append('</g>')
    return ''.join(out)

def cat_side(ink=INK, bg=BG):
    """a cat sitting side-on facing right, eyes closed happily, tail curling out behind"""
    body = ("M300 96 L306 140 Q318 160 300 182 Q290 192 282 196 Q276 230 278 270 L282 326 Q282 336 270 336 "
            "L190 336 Q148 336 148 298 Q150 246 198 214 Q222 196 236 176 Q226 150 234 128 L238 92 Q240 84 247 90 L266 112 Q283 104 300 96 Z")
    tail = f'<path d="M170 330 C112 336 84 300 102 268 C116 244 148 252 142 274" stroke="{ink}" stroke-width="15" fill="none" stroke-linecap="round"/>'
    face = (f'<path d="M276 142 q8 -7 16 0" stroke="{bg}" stroke-width="4" fill="none" stroke-linecap="round"/>'
            f'<path d="M286 168 l22 -4 M286 174 l22 4" stroke="{bg}" stroke-width="2.6" stroke-linecap="round"/>'
            f'<path d="M206 300 q22 -30 20 -64" stroke="{bg}" stroke-width="3" fill="none" stroke-linecap="round"/>')
    return f'{tail}<path d="{body}" fill="{ink}"/>{face}'

def page_wings(cx, cy, angles=(-8, -38), w=112, h=74, ink=INK, bg=BG, lines=3):
    """wings made of open-book pages, both sweeping up and back from the shoulder"""
    half = (f'M0 0 C-{w*0.3} -{h*0.28} -{w*0.7} -{h*0.3} -{w} -{h*0.16} '
            f'L-{w*1.02} -{h} C-{w*0.7} -{h*1.12} -{w*0.3} -{h*1.1} 0 -{h*0.82} Z')
    out = [f'<g transform="translate({cx} {cy})">']
    for k, a in enumerate(angles):
        out.append(f'<g transform="rotate({a})"><path d="{half}" fill="{ink}" stroke="{bg}" stroke-width="{4 if k else 0}"/>')
        for i in range(1, lines + 1):
            y0 = h * (0.32 + i * 0.17)
            out.append(f'<path d="M-{w*0.18} -{y0} C-{w*0.4} -{y0+h*0.12} -{w*0.65} -{y0+h*0.12} -{w*0.86} -{y0-h*0.02}" stroke="{bg}" stroke-width="3" fill="none" stroke-linecap="round"/>')
        out.append('</g>')
    out.append('</g>')
    return ''.join(out)

def pen_between(x1, y1, x2, y2, w=13, ink=INK, bg=BG, drop=True):
    """a fountain pen lying from (x1,y1) (end) to (x2,y2) (nib tip)"""
    import math
    L = math.hypot(x2 - x1, y2 - y1)
    ang = math.degrees(math.atan2(x2 - x1, -(y2 - y1)))  # 0 = pointing up
    return f'<g transform="translate({x2} {y2}) rotate({ang}) translate(0 0)">{pen(0, 0, L, w=w, ink=ink, bg=bg, drop=drop)}</g>'

def sparkle(x, y, r=10, ink=INK):
    return f'<path d="M{x} {y-r} Q{x+r*0.15} {y-r*0.15} {x+r} {y} Q{x+r*0.15} {y+r*0.15} {x} {y+r} Q{x-r*0.15} {y+r*0.15} {x-r} {y} Q{x-r*0.15} {y-r*0.15} {x} {y-r} Z" fill="{ink}"/>'

def page_fan_wing(cx, cy, pages=((128, 6), (122, 32), (108, 58)), ink=INK, bg=BG, hf=0.5):
    """a wing of book pages fanning out like flipped pages: each page curves up to a corner, with text lines"""
    out = [f'<g transform="translate({cx} {cy})">']
    for k, (L, a) in reversed(list(enumerate(pages))):
        h = L * hf
        page = (f'M0 0 C-{L*0.35} -{h*0.05} -{L*0.75} -{h*0.35} -{L} -{h} '   # lower edge up to the outer corner
                f'L-{L*0.88} -{h*1.32} '                                          # the square page corner
                f'C-{L*0.6} -{h*1.05} -{L*0.3} -{h*0.75} 0 -{h*0.62} Z')        # upper edge back to the spine
        lines = ''.join(f'<path d="M-{L*f} -{h*(0.26+f*0.62)} C-{L*(f+0.1)} -{h*(0.32+f*0.66)} -{L*(f+0.22)} -{h*(0.4+f*0.7)} -{L*(f+0.3)} -{h*(0.5+f*0.74)}" stroke="{bg}" stroke-width="2.6" fill="none" stroke-linecap="round"/>' for f in (0.18, 0.4, 0.62))
        out.append(f'<g transform="rotate({a})"><path d="{page}" fill="{ink}" stroke="{bg}" stroke-width="4" stroke-linejoin="round"/>{lines}</g>')
    out.append('</g>')
    return ''.join(out)

def book_wing2(cx, cy, rot=0, w=118, h=78, ink=INK, bg=BG):
    """one half of an open book as a wing: the cover, the page block showing along the lower edge, text lines"""
    half = (f'M0 0 C-{w*0.3} -{h*0.28} -{w*0.7} -{h*0.3} -{w} -{h*0.16} '
            f'L-{w*1.02} -{h} C-{w*0.7} -{h*1.12} -{w*0.3} -{h*1.1} 0 -{h*0.82} Z')
    edge = lambda d: f'<path d="M0 {d} C-{w*0.3} -{h*0.28-d} -{w*0.7} -{h*0.3-d} -{w} -{h*0.16-d}" stroke="{ink}" stroke-width="5" fill="none" stroke-linecap="round"/>'
    lines = ''.join(f'<path d="M-{w*0.16} -{h*(0.32+i*0.17)} C-{w*0.4} -{h*(0.44+i*0.17)} -{w*0.65} -{h*(0.44+i*0.17)} -{w*0.86} -{h*(0.3+i*0.17)}" stroke="{bg}" stroke-width="3" fill="none" stroke-linecap="round"/>' for i in (1, 2, 3))
    return f'<g transform="translate({cx} {cy}) rotate({rot})"><path d="{half}" fill="{ink}"/>{lines}{edge(10)}{edge(19)}</g>'

def cat_reading(ink=INK, bg=BG):
    """a cat loaf peeking over an open book; its tail is a pen"""
    book = (f'<path d="M200 300 C160 280 110 280 66 292 L66 336 C110 326 160 326 200 344 C240 326 290 326 334 336 L334 292 C290 280 240 280 200 300 Z" fill="{ink}"/>'
            f'<path d="M200 302 L200 340" stroke="{bg}" stroke-width="3"/>'
            + ''.join(f'<path d="M{x1} {y} C{(x1+x2)/2} {y-6} {(x1+x2)/2} {y-6} {x2} {y}" stroke="{bg}" stroke-width="2.6" fill="none" stroke-linecap="round"/>' for x1, x2, y in ((84, 186, 304), (84, 186, 316), (214, 316, 304), (214, 316, 316))))
    head = ("M126 290 Q122 220 150 196 L144 140 Q144 130 154 136 L190 166 Q200 162 212 162 L248 134 Q258 128 258 140 L252 196 Q280 220 276 290 Z")
    face = (f'<ellipse cx="180" cy="228" rx="10" ry="12" fill="{bg}"/><ellipse cx="222" cy="228" rx="10" ry="12" fill="{bg}"/>'
            f'<circle cx="182" cy="232" r="5" fill="{ink}"/><circle cx="220" cy="232" r="5" fill="{ink}"/><path d="M195 248 l6 6 l6 -6 z" fill="{bg}"/>'
            )
    # paws resting on the pages, with toe lines
    paws = ''.join(f'<ellipse cx="{x}" cy="294" rx="21" ry="12" fill="{ink}" stroke="{bg}" stroke-width="3"/><path d="M{x-6} 288 l0 8 M{x+6} 288 l0 8" stroke="{bg}" stroke-width="2.4" stroke-linecap="round"/>' for x in (158, 244))
    return f'<path d="{head}" fill="{ink}"/>{face}{book}{paws}'
