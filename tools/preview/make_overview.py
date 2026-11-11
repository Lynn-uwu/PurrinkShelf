# Combine screenshots into one labelled sheet: python3 make_overview.py out.png name:Label ...
import sys
from PIL import Image, ImageDraw, ImageFont
out, items = sys.argv[1], [a.split(':', 1) for a in sys.argv[2:]]
W, H, s, pad, lab, cols = 702, 936, 0.5, 20, 34, 3
w, h = int(W * s), int(H * s)
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols + 1) * pad, rows * (h + lab) + (rows + 1) * pad), '#d9d9d9')
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
d = ImageDraw.Draw(sheet)
for i, (fn, label) in enumerate(items):
    x, y = pad + (i % cols) * (w + pad), pad + (i // cols) * (h + lab + pad)
    d.text((x, y), f'{i + 1}. {label}', fill='black', font=f)
    sheet.paste(Image.open(f'shots/{fn}.png').convert('RGB').resize((w, h), Image.LANCZOS), (x, y + lab))
    d.rectangle([x - 1, y + lab - 1, x + w, y + lab + h], outline='black')
sheet.save(out)
