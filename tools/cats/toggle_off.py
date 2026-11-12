"""The 'off' toggle's ears: the black toggle ears (assets/cat/toggle-ears.png) redrawn as an outline
filled with white, with a white strip below that hides the toggle's top line under the ears."""
import os, numpy as np, scipy.ndimage as nd
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'cat')
a = np.array(Image.open(os.path.join(A, 'toggle-ears.png')))[..., 3] > 128
P, EXTRA, STROKE, SS = 9, 10, 8, 4  # padding, rows below, line width (px), supersampling
H, W = a.shape
m = np.zeros((H + P + EXTRA, W + 2 * P), bool)
m[P:P + H, P:P + W] = a
body = P + 27  # where the black picture's body (the toggle itself) starts
m[body:, :] = False
for y in range(body, m.shape[0]):
    m[y] = m[body - 1]
big = np.kron(m, np.ones((SS, SS), bool))
yy, xx = np.mgrid[-P * SS:P * SS + 1, -P * SS:P * SS + 1]
ring = nd.binary_dilation(big, structure=(yy ** 2 + xx ** 2) <= (STROKE * SS) ** 2) & ~big
ring[body * SS:, :] = False
down = lambda x: x.reshape(x.shape[0] // SS, SS, x.shape[1] // SS, SS).mean(axis=(1, 3))
r, f = down(ring.astype(float)), down(big.astype(float))
alpha = np.clip(r + f, 0, 1)
out = np.zeros(m.shape + (4,), np.uint8)
out[..., :3] = (255 * (1 - np.clip(r / np.maximum(alpha, 1e-6), 0, 1)))[..., None].astype(np.uint8)
out[..., 3] = (alpha * 255).astype(np.uint8)
Image.fromarray(out).save(os.path.join(A, 'toggle-ears-off.png'))
print(out.shape)
