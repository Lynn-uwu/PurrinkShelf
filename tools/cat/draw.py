"""Hand-drawn cat decorations for the Cat look (original drawings). Renders assets/cat/*.png."""
import subprocess, os
K = '#1a1a1a'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'cat')
os.makedirs(OUT, exist_ok=True)
def save(name, w, h, body, scale=3):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*scale}" height="{h*scale}">{body}</svg>'
    open(f'{name}.svg', 'w').write(svg)
    subprocess.run(['rsvg-convert', f'{name}.svg', '-o', os.path.join(OUT, f'{name}.png')], check=True)

# a cat peeking over an edge: the edge is y=58; head above it, two paws hanging over
paw_over = lambda x: (f'<path d="M{x-13} 54 Q{x-14} 74 {x} 75 Q{x+14} 74 {x+13} 54 Z" fill="{K}"/>'
                      f'<path d="M{x-5} 66 l0 7 M{x+5} 66 l0 7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>')
save('peek', 160, 80,
     f'<path d="M38 58 Q36 30 52 20 L48 4 Q48 0 52 2 L68 13 Q80 9 92 13 L108 2 Q112 0 112 4 L108 20 Q124 30 122 58 Z" fill="{K}"/>'
     '<ellipse cx="66" cy="38" rx="6" ry="7" fill="#fff"/><ellipse cx="94" cy="38" rx="6" ry="7" fill="#fff"/>'
     f'<circle cx="67" cy="40" r="3" fill="{K}"/><circle cx="93" cy="40" r="3" fill="{K}"/>'
     '<path d="M77 47 l3 3 l3 -3 z" fill="#fff"/>'
     f'<path d="M36 44 l-16 -3 M36 49 l-15 2 M124 44 l16 -3 M124 49 l15 2" stroke="{K}" stroke-width="1.6" stroke-linecap="round"/>'
     + paw_over(60) + paw_over(100))

# two ears to sit on top of a round button (circle of 70 across, ears at about 10 and 2 o'clock)
save('ears', 70, 24,
     f'<path d="M8 24 Q9 12 12 2 Q13 0 15 1 Q24 8 30 16 Z" fill="{K}"/><path d="M62 24 Q61 12 58 2 Q57 0 55 1 Q46 8 40 16 Z" fill="{K}"/>'
     '<path d="M14 18 Q15 11 16 7 M56 18 Q55 11 54 7" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>')

# one paw print
save('paw', 40, 40,
     f'<path d="M20 38 C9 38 7 30 11 25 C14 21 17 19 20 19 C23 19 26 21 29 25 C33 30 31 38 20 38 Z" fill="{K}"/>'
     f'<ellipse cx="7" cy="17" rx="4.4" ry="5.6" transform="rotate(-20 7 17)" fill="{K}"/><ellipse cx="15" cy="9" rx="4.4" ry="5.8" transform="rotate(-6 15 9)" fill="{K}"/>'
     f'<ellipse cx="25" cy="9" rx="4.4" ry="5.8" transform="rotate(6 25 9)" fill="{K}"/><ellipse cx="33" cy="17" rx="4.4" ry="5.6" transform="rotate(20 33 17)" fill="{K}"/>')

# a cat sitting, front-on, with its tail curled on the floor (same cat as the logo sketch)
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'logo', 'cat'))
from parts import cat_sitting
open('sit.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="86 54 270 300" width="270" height="300">{cat_sitting(ink=K)}</svg>')
subprocess.run(['rsvg-convert', 'sit.svg', '-o', os.path.join(OUT, 'sit.png')], check=True)

# a hand-drawn divider: line · heart · cat face · heart · line
heart = lambda x, y, s: f'<path d="M{x} {y+s*0.9} C{x-s*1.2} {y} {x-s*0.8} {y-s*0.9} {x} {y-s*0.3} C{x+s*0.8} {y-s*0.9} {x+s*1.2} {y} {x} {y+s*0.9} Z" fill="none" stroke="{K}" stroke-width="1.6" stroke-linejoin="round"/>'
save('divider', 300, 30,
     f'<path d="M4 15 Q60 13 110 15" stroke="{K}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-dasharray="0.1 7"/>'
     f'<path d="M190 15 Q240 17 296 15" stroke="{K}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-dasharray="0.1 7"/>'
     + heart(122, 15, 6) + heart(178, 15, 6) +
     f'<path d="M136 26 Q135 12 140 8 L139 2 L146 6 Q150 5 154 6 L161 2 L160 8 Q165 12 164 26 Z" fill="{K}"/>'
     '<circle cx="145" cy="16" r="2" fill="#fff"/><circle cx="155" cy="16" r="2" fill="#fff"/>')
print('ok')
