import subprocess
from cats import *
names = ['loaf', 'sitting', 'peek', 'sleepy', 'stretch']
for n in names:
    open(n + '.svg', 'w').write(svg(globals()[n](), bg='#c9c9c9'))
    subprocess.run(['rsvg-convert', n + '.svg', '-o', n + '.png'], check=True)
from PIL import Image
c = Image.new('RGB', (400 * len(names), 400), '#c9c9c9')
for i, n in enumerate(names): c.paste(Image.open(n + '.png'), (i * 400, 0))
c.save('sheet.png')
