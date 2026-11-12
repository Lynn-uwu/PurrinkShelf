"""Chubby blob cats (original drawings in a soft, round silhouette style): white dot eyes, little whisker dashes."""
K = '#151515'
W = '#ffffff'

def face(cx, cy, gap=18, k=K, w=W, size=1.0, closed=False, whisk=True):
    s = size
    if closed:
        eyes = (f'<path d="M{cx-gap-4*s} {cy} q{4*s} {3*s} {8*s} 0" stroke="{w}" stroke-width="{2*s}" fill="none" stroke-linecap="round"/>'
                f'<path d="M{cx+gap-4*s} {cy} q{4*s} {3*s} {8*s} 0" stroke="{w}" stroke-width="{2*s}" fill="none" stroke-linecap="round"/>')
    else:
        eyes = f'<ellipse cx="{cx-gap}" cy="{cy}" rx="{3.2*s}" ry="{4.6*s}" fill="{w}"/><ellipse cx="{cx+gap}" cy="{cy}" rx="{3.2*s}" ry="{4.6*s}" fill="{w}"/>'
    mouth = f'<path d="M{cx-2.4*s} {cy+7*s} q{2.4*s} {2.4*s} {4.8*s} 0" stroke="{w}" stroke-width="{1.4*s}" fill="none" stroke-linecap="round"/>'
    wh = ''
    if whisk:
        for sgn in (-1, 1):
            x0 = cx + sgn * (gap + 9 * s)
            wh += ''.join(f'<path d="M{x0} {cy+(4+i*3.6)*s} l{sgn*7*s} {(i-1)*1.6*s}" stroke="{w}" stroke-width="{1.3*s}" stroke-linecap="round"/>' for i in range(3))
    return eyes + mouth + wh

def ears(xl, xr, y, h=26, k=K):
    """two soft round-tipped ears whose bases sit at height y"""
    e = lambda x, d: f'<path d="M{x-16} {y+18} Q{x-14+d*4} {y-h+6} {x+d*3} {y-h} Q{x+9+d*3} {y-h+4} {x+17} {y+20} Z" fill="{k}"/>'
    return e(xl, -1) + e(xr, 1)

def loaf(k=K):
    """a round mochi loaf with its tail up behind it"""
    tail = f'<path d="M156 156 C188 150 184 108 176 96 C170 86 176 74 186 80" stroke="{k}" stroke-width="14" fill="none" stroke-linecap="round"/>'
    body = f'<path d="M30 148 C28 104 56 74 100 74 C144 74 172 104 170 148 C170 168 150 174 100 174 C50 174 30 168 30 148 Z" fill="{k}"/>'
    return tail + ears(64, 134, 86) + body + face(100, 128)

def sitting(k=K):
    """a pear-shaped cat sitting, tail curled round to the front"""
    body = f'<path d="M58 70 C40 82 36 110 38 140 C40 168 60 178 98 178 C136 178 156 168 158 140 C160 110 154 82 136 70 C122 60 72 60 58 70 Z" fill="{k}"/>'
    tail = f'<path d="M150 166 C182 164 186 132 172 124" stroke="{k}" stroke-width="14" fill="none" stroke-linecap="round"/>'
    return tail + ears(66, 128, 70) + body + face(97, 108)

def peek(k=K):
    """a round head peeking over an edge at y=120, two paws hanging over it"""
    head = f'<path d="M40 122 C38 80 64 54 100 54 C136 54 162 80 160 122 Z" fill="{k}"/>'
    paws = ''.join(f'<path d="M{x-15} 116 Q{x-17} 142 {x} 143 Q{x+17} 142 {x+15} 116 Z" fill="{k}"/><path d="M{x-5} 132 l0 6 M{x+5} 132 l0 6" stroke="{W}" stroke-width="1.8" stroke-linecap="round"/>' for x in (72, 128))
    return ears(66, 134, 64) + head + face(100, 98) + paws

def sleepy(k=K):
    """curled up asleep: a round bun with the tail wrapped round the front"""
    body = f'<path d="M26 136 C26 100 58 78 104 80 C148 82 176 104 176 138 C176 166 150 176 102 176 C54 176 26 166 26 136 Z" fill="{k}"/>'
    tail = (f'<path d="M168 150 C186 170 140 186 104 176" stroke="{W}" stroke-width="20" fill="none" stroke-linecap="round"/>'
            f'<path d="M168 150 C186 170 140 186 104 176" stroke="{k}" stroke-width="13" fill="none" stroke-linecap="round"/>')
    head_ears = ears(48, 98, 92, h=22)
    return head_ears + body + tail + face(72, 122, gap=13, closed=True, whisk=False) + '<path d="M150 66 l8 0 l-8 9 l8 0" stroke="#151515" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'

def stretch(k=K):
    """front down, bottom up, tail high: a big stretch"""
    body = f'<path d="M22 150 C20 128 40 116 70 120 C96 124 112 100 136 82 C160 66 186 80 184 108 C182 132 176 156 168 164 L156 164 L154 140 C140 150 120 160 100 162 L80 166 C60 170 26 172 22 150 Z" fill="{k}"/>'
    tail = f'<path d="M176 88 C190 60 186 30 164 34" stroke="{k}" stroke-width="13" fill="none" stroke-linecap="round"/>'
    return tail + ears(36, 74, 128, h=22) + body + face(56, 146, gap=12, size=0.9)

def svg(inner, w=200, h=200, bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*2}" height="{h*2}">{b}{inner}</svg>'
