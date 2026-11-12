"""Draws the slightly wobbly pen lines for the hand-drawn look: assets/sketch/h.png (across) and
v.png (down). Each is 1400 x 8 design units at 2 pixels per unit; the line is about 2.2 units
thick in the middle of the 8. The app crops (never stretches) them, so the wobble stays the same
size on short and long edges."""
import os, numpy as np
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sketch')
L, T, SS = 2800, 16, 4  # pixels long, pixels tall, supersampling
rng = np.random.default_rng(7)
x = np.arange(L * SS) / SS
def noise(amps):
    y = np.zeros_like(x)
    for wl, a in amps:
        y += a * np.sin(2 * np.pi * x / wl + rng.uniform(0, 2 * np.pi))
    return y
centre = T / 2 + noise([(520, 0.55), (230, 0.45), (97, 0.22), (41, 0.08)])  # a gentle wander, under 1.3 px
thick = 4.4 + noise([(380, 0.45), (150, 0.35), (53, 0.15)])  # pressure: thicker and thinner
ys = (np.arange(T * SS) + 0.5) / SS
d = np.abs(ys[:, None] - centre[None, :]) - thick[None, :] / 2
a = np.clip(0.5 - d * 1.2, 0, 1)  # soft edge
a = a.reshape(T, SS, L, SS).mean(axis=(1, 3))
img = np.zeros((T, L, 4), np.uint8)
img[..., 3] = (a * 255).round().astype(np.uint8)
Image.fromarray(img).save(os.path.join(OUT, 'h.png'), optimize=True)
# the down line is another stretch of wobble, turned
rng = np.random.default_rng(11)
centre = T / 2 + noise([(470, 0.55), (210, 0.45), (89, 0.22), (37, 0.08)])
thick = 4.4 + noise([(340, 0.45), (160, 0.35), (61, 0.15)])
d = np.abs(ys[:, None] - centre[None, :]) - thick[None, :] / 2
a = np.clip(0.5 - d * 1.2, 0, 1).reshape(T, SS, L, SS).mean(axis=(1, 3))
img = np.zeros((T, L, 4), np.uint8)
img[..., 3] = (a * 255).round().astype(np.uint8)
Image.fromarray(img).rotate(90, expand=True).save(os.path.join(OUT, 'v.png'), optimize=True)
print('ok')
