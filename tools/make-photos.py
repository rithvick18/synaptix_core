#!/usr/bin/env python3
"""
Generates the demo packs' photographic media.

SPEC.md §2's hard product rule is about the *engine* never inventing autobiographical
memory; a caregiver pack is authored content, and these two packs are fictional demo
patients. Nothing here depicts a real person: each "photo" is a flat illustrated
portrait built from a gradient, a figure silhouette and an initial, and each anchor
photo is an abstract scene. They exist so ?patient=mira and ?patient=raju are visibly,
not just textually, different.

Writes P6 PPM; tools/make-media.sh converts to JPEG with ffmpeg. Stdlib only.
"""
import math
import os
import sys

W = H = 512

# A 5x7 bitmap for the six initials the two packs need. Rows are top to bottom.
GLYPHS = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
}


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def over(dst, src, alpha):
    return tuple(round(dst[i] + (src[i] - dst[i]) * alpha) for i in range(3))


def write_ppm(path, px):
    with open(path, 'wb') as f:
        f.write(b'P6\n%d %d\n255\n' % (W, H))
        f.write(bytes(v for row in px for p in row for v in p))


def blank(top, bottom):
    return [[lerp(top, bottom, y / (H - 1)) for _ in range(W)] for y in range(H)]


def disc(px, cx, cy, r, colour, softness=2.0):
    for y in range(max(0, int(cy - r - 2)), min(H, int(cy + r + 3))):
        for x in range(max(0, int(cx - r - 2)), min(W, int(cx + r + 3))):
            d = math.hypot(x - cx, y - cy)
            a = max(0.0, min(1.0, (r - d) / softness))
            if a > 0:
                px[y][x] = over(px[y][x], colour, a)


def ellipse(px, cx, cy, rx, ry, colour, softness=2.0):
    for y in range(max(0, int(cy - ry - 2)), min(H, int(cy + ry + 3))):
        for x in range(max(0, int(cx - rx - 2)), min(W, int(cx + rx + 3))):
            d = math.hypot((x - cx) / rx, (y - cy) / ry)
            a = max(0.0, min(1.0, (1 - d) * min(rx, ry) / softness))
            if a > 0:
                px[y][x] = over(px[y][x], colour, a)


def band(px, y0, y1, colour):
    for y in range(max(0, y0), min(H, y1)):
        for x in range(W):
            px[y][x] = colour


def glyph(px, letter, cx, cy, scale, colour):
    rows = GLYPHS[letter]
    gw, gh = 5 * scale, 7 * scale
    x0, y0 = int(cx - gw / 2), int(cy - gh / 2)
    for r, row in enumerate(rows):
        for c, bit in enumerate(row):
            if bit != '1':
                continue
            for y in range(y0 + r * scale, y0 + (r + 1) * scale):
                for x in range(x0 + c * scale, x0 + (c + 1) * scale):
                    if 0 <= x < W and 0 <= y < H:
                        px[y][x] = colour


def grain(px, amount=6):
    """A little ordered noise so a flat fill does not read as a broken texture."""
    for y in range(H):
        for x in range(W):
            n = ((x * 7 + y * 13) % 17 - 8) * amount // 8
            px[y][x] = tuple(max(0, min(255, c + n)) for c in px[y][x])


def portrait(path, *, bg_top, bg_bottom, skin, hair, cloth, initial,
             head_r=104, hair_style='bun', shoulder=210):
    px = blank(bg_top, bg_bottom)
    # A soft vignette circle behind the figure, like a studio backdrop.
    disc(px, W / 2, 232, 188, lerp(bg_top, (255, 255, 255), 0.18), softness=60)
    # Shoulders.
    ellipse(px, W / 2, 520, shoulder, 205, cloth, softness=3)
    # Neck.
    ellipse(px, W / 2, 352, 44, 56, lerp(skin, (0, 0, 0), 0.12), softness=2)
    # Hair behind the head.
    if hair_style == 'long':
        ellipse(px, W / 2, 268, head_r + 26, head_r + 62, hair, softness=3)
    elif hair_style == 'bun':
        disc(px, W / 2, 138, 44, hair, softness=2)
        ellipse(px, W / 2, 244, head_r + 14, head_r + 16, hair, softness=3)
    elif hair_style == 'short':
        ellipse(px, W / 2, 236, head_r + 10, head_r + 4, hair, softness=3)
    elif hair_style == 'cap':
        ellipse(px, W / 2, 214, head_r + 12, head_r - 20, hair, softness=3)
    # Face.
    ellipse(px, W / 2, 252, head_r, head_r + 14, skin, softness=2)
    # Fringe / beard cues, so silhouettes differ beyond colour.
    if hair_style in ('short', 'cap'):
        ellipse(px, W / 2, 330, head_r - 14, 40, lerp(hair, skin, 0.35), softness=3)
    # The initial on a dark plate, bottom-left, like a caregiver's label on a print.
    # The plate is what keeps it readable over a light garment.
    for y in range(408, 498):
        for x in range(28, 124):
            px[y][x] = over(px[y][x], (24, 22, 26), 0.66)
    glyph(px, initial, 76, 452, 9, (255, 255, 255))
    grain(px)
    write_ppm(path, px)


def scene_festival(path):
    """mira/bihu.jpg — an abstract warm festival evening. No real place, no real people."""
    px = blank((250, 176, 92), (176, 74, 66))
    disc(px, 352, 168, 62, (255, 231, 168), softness=4)
    disc(px, 352, 168, 96, (255, 216, 140), softness=48)
    band(px, 330, H, (86, 104, 62))
    band(px, 330, 348, (108, 128, 74))
    # Figures round a fire: shoulders + heads, no faces.
    fire = (255, 196, 96)
    ellipse(px, 256, 420, 44, 26, (214, 118, 52), softness=3)
    disc(px, 256, 396, 30, fire, softness=8)
    for i, (x, s) in enumerate(((128, 1.0), (186, 0.86), (326, 0.92), (392, 1.06))):
        dark = (44, 38, 40) if i % 2 == 0 else (58, 46, 44)
        ellipse(px, x, 430, 40 * s, 74 * s, dark, softness=2)
        disc(px, x, 342 - 10 * s, 26 * s, dark, softness=2)
    grain(px, 8)
    write_ppm(path, px)


def scene_lake(path):
    """raju/chilika.jpg — an abstract cool lake morning. Deliberately unlike the festival."""
    px = blank((150, 204, 226), (226, 238, 232))
    disc(px, 150, 128, 44, (255, 250, 228), softness=6)
    band(px, 300, H, (76, 132, 148))
    for y in range(300, H):
        t = (y - 300) / (H - 300)
        row = lerp((92, 152, 166), (36, 82, 104), t)
        for x in range(W):
            ripple = int(10 * math.sin((x / 26.0) + y / 9.0) * (0.4 + t))
            px[y][x] = tuple(max(0, min(255, c + ripple)) for c in row)
    # A boat: hull, mast, sail.
    hull = (52, 44, 40)
    ellipse(px, 300, 352, 112, 22, hull, softness=2)
    for y in range(236, 352):
        for x in range(296, 302):
            px[y][x] = hull
    for y in range(240, 344):
        w = int((y - 240) * 0.62)
        for x in range(302, 302 + w):
            if x < W:
                px[y][x] = (244, 240, 230)
    # Birds.
    for bx, by, s in ((96, 196, 1.0), (140, 172, 0.8), (416, 150, 1.1)):
        for k in range(int(-14 * s), int(14 * s)):
            y = by + int(abs(k) * 0.45)
            for d in range(2):
                if 0 <= y + d < H and 0 <= bx + k < W:
                    px[y + d][bx + k] = (58, 62, 70)
    grain(px, 7)
    write_ppm(path, px)


PEOPLE = {
    'mira/ananya': dict(bg_top=(232, 198, 214), bg_bottom=(150, 104, 138), skin=(198, 146, 110),
                        hair=(38, 28, 32), cloth=(176, 64, 96), initial='A', hair_style='long'),
    'mira/bina': dict(bg_top=(206, 216, 188), bg_bottom=(104, 126, 96), skin=(184, 132, 100),
                      hair=(56, 44, 40), cloth=(70, 112, 96), initial='B', hair_style='bun'),
    'mira/rupa': dict(bg_top=(240, 214, 176), bg_bottom=(168, 124, 76), skin=(206, 158, 122),
                      hair=(96, 86, 84), cloth=(202, 152, 72), initial='R', hair_style='bun',
                      head_r=110, shoulder=224),
    'raju/manoj': dict(bg_top=(186, 206, 232), bg_bottom=(74, 104, 152), skin=(176, 124, 92),
                       hair=(30, 26, 28), cloth=(52, 78, 128), initial='M', hair_style='short'),
    'raju/sarita': dict(bg_top=(226, 206, 232), bg_bottom=(118, 92, 148), skin=(200, 152, 118),
                        hair=(178, 174, 176), cloth=(120, 84, 150), initial='S', hair_style='bun'),
    'raju/iqbal': dict(bg_top=(212, 224, 214), bg_bottom=(84, 116, 104), skin=(170, 120, 88),
                       hair=(212, 208, 200), cloth=(64, 96, 88), initial='I', hair_style='cap',
                       head_r=98, shoulder=232),
}

if __name__ == '__main__':
    out = sys.argv[1]
    for key, spec in PEOPLE.items():
        path = os.path.join(out, key + '.ppm')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        portrait(path, **spec)
        print('wrote', path)
    scene_festival(os.path.join(out, 'mira', 'bihu.ppm'))
    scene_lake(os.path.join(out, 'raju', 'chilika.ppm'))
    print('wrote scenes')
