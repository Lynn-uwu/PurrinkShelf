"""Turns the walkthrough screenshots (walk.cjs) into one video: a caption band on top,
a ring on what gets tapped, each step held for its time. Usage: walk_video.py <dir> <out.mp4>"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

D, OUT = sys.argv[1], sys.argv[2]
steps = json.load(open(os.path.join(D, 'steps.json')))
W = 1080
SC = W / 702  # page px -> video px
SH = round(936 * SC)
BAND = 210
H = SH + BAND
F = '/usr/share/fonts/opentype/inter/'
big = ImageFont.truetype(F + 'Inter-SemiBold.otf', 38)
small = ImageFont.truetype(F + 'Inter-Bold.otf', 24)
ACC = (232, 89, 12)

chapters = []
for s in steps:
    if not chapters or chapters[-1] != s['chapter']:
        chapters.append(s['chapter'])


def wrap(text, font, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if font.getlength(t) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def frame(s, i):
    img = Image.new('RGB', (W, H), (24, 24, 24))
    shot = Image.open(os.path.join(D, s['img'])).convert('RGB').resize((W, SH), Image.LANCZOS)
    img.paste(shot, (0, BAND))
    d = ImageDraw.Draw(img, 'RGBA')
    ci = chapters.index(s['chapter']) + 1
    d.text((48, 30), f"{s['chapter'].upper()}   ·   {ci} / {len(chapters)}", font=small, fill=(255, 170, 120))
    y = 74
    for line in wrap(s['caption'], big, W - 96)[:3]:
        d.text((48, y), line, font=big, fill=(255, 255, 255))
        y += 48
    # progress bar along the bottom of the band
    d.rectangle([0, BAND - 6, int(W * (i + 1) / len(steps)), BAND - 1], fill=ACC)
    r = s.get('ring')
    if r:
        x0, y0 = r['x'] * SC - 10, r['y'] * SC + BAND - 10
        x1, y1 = (r['x'] + r['width']) * SC + 10, (r['y'] + r['height']) * SC + BAND + 10
        d.rounded_rectangle([x0, y0, x1, y1], radius=22, fill=(232, 89, 12, 45), outline=ACC, width=7)
        # a finger dot in the middle, like a tap
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(232, 89, 12, 200), outline=(255, 255, 255), width=4)
    return img


tmp = os.path.join(D, 'clips')
os.makedirs(tmp, exist_ok=True)
names = []
for i, s in enumerate(steps):
    png = os.path.join(tmp, f'{i:03d}.png')
    frame(s, i).save(png)
    mp4 = os.path.join(tmp, f'{i:03d}.mp4')
    if not os.path.exists(mp4):
        part = mp4[:-4] + '.part.mp4'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', png, '-vf', f"format=yuv420p,loop=-1:1,trim=duration={s['dur']}",
                        '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', part], check=True)
        os.rename(part, mp4)
    names.append(mp4)
with open(os.path.join(tmp, 'list.txt'), 'w') as f:
    f.writelines(f"file '{n}'\n" for n in names)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', OUT], check=True)
print('video', OUT, round(sum(s['dur'] for s in steps)), 's', len(steps), 'shots')
