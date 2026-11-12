"""Cuts the cat pictures out of source-sheet.png into assets/cat/*.png: each on a transparent
background (only the outside is cleared, so eyes, whiskers and page lines stay white)."""
import os
import numpy as np, scipy.ndimage as nd
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'cat')
os.makedirs(OUT, exist_ok=True)
L = np.array(Image.open('source-sheet.png').convert('L')).astype(np.int32)
dark = L < 128
lab, n = nd.label(nd.binary_dilation(dark, iterations=28))
# components in the order scipy finds them (top to bottom, then left to right within a band)
objs = nd.find_objects(lab)
by_pos = sorted(range(n), key=lambda i: ((objs[i][0].start + objs[i][0].stop) // 2 // 380, objs[i][1].start))
expect = ['logo', 'peek', 'ears', 'loaf', 'sleepy', 'stretch', 'sitting', 'paw']
rows = by_pos
for name, i in zip(expect, rows):
    ys, xs = np.where((lab == i + 1) & dark)
    pad = 6
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(L.shape[0], ys.max() + pad + 1), max(0, xs.min() - pad), min(L.shape[1], xs.max() + pad + 1)
    c = L[y0:y1, x0:x1]
    light = c > 200
    ll, _ = nd.label(light)
    border = set(np.unique(np.concatenate([ll[0], ll[-1], ll[:, 0], ll[:, -1]]))) - {0}
    bg = np.isin(ll, list(border))
    edge = nd.binary_dilation(bg, iterations=2) & ~bg
    rgba = np.zeros(c.shape + (4,), np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = c
    rgba[..., 3] = 255
    rgba[bg, 3] = 0
    rgba[edge, 0:3] = 0
    rgba[edge, 3] = np.clip(255 - c[edge], 0, 255)
    if name == 'peek':
        # drop the drawn edge line: on a card, the card's own top border is the edge (paws stay)
        a = rgba[..., 3] > 128
        cnt = a.sum(1)
        full = np.where(cnt > 0.9 * cnt.max())[0]
        y0l, y1l = full.min() - 1, full.max() + 2
        paws = nd.binary_dilation(a[y1l + 1], iterations=2)
        for y in range(y0l, y1l):
            rgba[y, ~paws, 3] = 0
    Image.fromarray(rgba).save(os.path.join(OUT, name + '.png'))
    print(name, x1 - x0, y1 - y0)

# the app logo stays the shelf of books (assets/logo.svg); the winged cat is kept in assets/cat/logo.png
