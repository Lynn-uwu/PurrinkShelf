"""Renders the Cat look's pictures into assets/cat (chubby blob cats, see cats.py)."""
import subprocess, os
from cats import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'cat')
def save(name, vb, inner, scale=3):
    x, y, w, h = vb
    open(name + '.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w*scale}" height="{h*scale}">{inner}</svg>')
    subprocess.run(['rsvg-convert', name + '.svg', '-o', os.path.join(OUT, name + '.png')], check=True)
save('peek', (30, 30, 140, 120), peek())          # the card's top edge is at 90 of 120
save('ears', (40, 30, 120, 40), ears(66, 134, 64))  # two ears for the raised taskbar button
save('loaf', (24, 60, 172, 120), loaf())
save('sitting', (30, 34, 160, 148), sitting())
save('sleepy', (20, 58, 170, 126), sleepy())
save('stretch', (16, 26, 180, 148), stretch())
# one paw print (pins on notes, messages, the Look switch)
save('paw', (0, 0, 40, 40),
     f'<path d="M20 38 C9 38 7 30 11 25 C14 21 17 19 20 19 C23 19 26 21 29 25 C33 30 31 38 20 38 Z" fill="{K}"/>'
     f'<ellipse cx="7" cy="17" rx="4.4" ry="5.6" transform="rotate(-20 7 17)" fill="{K}"/><ellipse cx="15" cy="9" rx="4.4" ry="5.8" transform="rotate(-6 15 9)" fill="{K}"/>'
     f'<ellipse cx="25" cy="9" rx="4.4" ry="5.8" transform="rotate(6 25 9)" fill="{K}"/><ellipse cx="33" cy="17" rx="4.4" ry="5.6" transform="rotate(20 33 17)" fill="{K}"/>')
print('ok')
