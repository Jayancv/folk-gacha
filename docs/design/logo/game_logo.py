"""Folk Gacha game logo: a chunky arched wordmark over three fanned cards and a light burst.

    python game_logo.py            (from docs/design/logo/; FONTS=<dir> if the fonts live elsewhere)

Needs Python + fonttools and two Google Fonts .ttf files in FONTS (default ./fonts):
  LuckiestGuy-Regular.ttf (Apache 2.0)  -> the wordmark
  LilitaOne-Regular.ttf   (OFL)         -> the ribbon tagline
Text is turned into outlines, so the SVGs look the same everywhere.

Writes:
  game-logo.svg            transparent background (title screen, store banner)
  game-logo-dark.svg       on the dark table colour (social, previews)
  game-icon.svg            square app icon (PWA, Home Screen); make-pwa-icons.mjs renders it
  game-favicon.svg         simplified icon for 16-48 px
"""
import math
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTS = os.environ.get('FONTS', 'fonts')
INK = '#2a0a0e'        # outline colour (near-black lacquer)
TABLE = '#170e10'      # the game table background (manifest theme colour)


def glyphs(text, font_file, size):
    f = TTFont(os.path.join(FONTS, font_file))
    gs, cmap, upm, hmtx = f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm, f['hmtx']
    sc = size / upm
    out = []
    for c in text:
        n = cmap[ord(c)]
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (sc, 0, 0, -sc, 0, 0)))
        out.append((pen.getCommands(), hmtx[n][0] * sc))
    return out


def arched(text, font_file, size, cx, base_y, radius, tracking=0):
    """Letters placed on an arc (radius > 0 bends upward like a rainbow). Returns <g> transforms + paths."""
    gl = glyphs(text, font_file, size)
    width = sum(w for _, w in gl) + tracking * (len(gl) - 1)
    x = -width / 2
    parts = []
    for d, w in gl:
        mid = x + w / 2
        a = mid / radius                          # angle along the arc
        px = cx + radius * math.sin(a)
        py = base_y + radius * (1 - math.cos(a))
        parts.append((f'translate({px:.1f} {py:.1f}) rotate({math.degrees(a):.2f}) translate({-w / 2:.1f} 0)', d))
        x += w + tracking
    return parts


def word(parts, grad, outer=26, mid=12):
    """Game-style lettering: thick dark outline, warm bevel line, gradient fill, glossy top highlight."""
    out = []
    for t, d in parts:  # shadow
        out.append(f'<path transform="translate(0 9) {t}" d="{d}" fill="{INK}" stroke="{INK}" stroke-width="{outer}" stroke-linejoin="round" opacity=".55"/>')
    for t, d in parts:
        out.append(f'<path transform="{t}" d="{d}" fill="{INK}" stroke="{INK}" stroke-width="{outer}" stroke-linejoin="round"/>')
    for t, d in parts:
        out.append(f'<path transform="{t}" d="{d}" fill="#7a2512" stroke="#c4561c" stroke-width="{mid}" stroke-linejoin="round"/>')
    for t, d in parts:
        out.append(f'<path transform="{t}" d="{d}" fill="url(#{grad})"/>')
    return '\n'.join(out)


def star(cx, cy, s, fill='#fff6d8', op=1):
    k = s * 0.22
    return (f'<path d="M{cx} {cy - s} Q{cx + k} {cy - k} {cx + s} {cy} Q{cx + k} {cy + k} {cx} {cy + s} '
            f'Q{cx - k} {cy + k} {cx - s} {cy} Q{cx - k} {cy - k} {cx} {cy - s}Z" fill="{fill}" opacity="{op}"/>')


def burst(cx, cy, r, n=18, color='#ffcf5a', op=.22):
    rays = []
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = a0 + math.pi / n * 0.55
        p = lambda a: f'{cx + r * math.cos(a):.1f} {cy + r * math.sin(a):.1f}'
        rays.append(f'M{cx} {cy} L{p(a0)} L{p(a1)}Z')
    m = f'burst{cx:.0f}{cy:.0f}'
    return (f'<mask id="{m}"><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#fade)"/></mask>'
            f'<path d="{" ".join(rays)}" fill="{color}" opacity="{op}" mask="url(#{m})"/>')


def lotus(cx, cy, s):
    """Small lotus mark for card backs."""
    pet = 'M0 -1 C .5 -.45 .45 .3 0 .55 C -.45 .3 -.5 -.45 0 -1Z'
    g = [f'<g transform="translate({cx} {cy}) scale({s})">']
    for ang, fill in ((-62, '#e2607e'), (62, '#e2607e'), (-32, '#f4a6b8'), (32, '#f4a6b8'), (0, '#ffe3ea')):
        g.append(f'<path d="{pet}" transform="rotate({ang} 0 .55)" fill="{fill}" stroke="#f2c14e" stroke-width=".06"/>')
    g.append('<path d="M-.75 .62 Q0 .82 .75 .62" stroke="#f2c14e" stroke-width=".09" fill="none" stroke-linecap="round"/></g>')
    return ''.join(g)


def card_back(w, h, frame, glow=False):
    """A card centred on (0,0): lacquer back, rarity frame, diamond lattice, lotus seal."""
    r = w * 0.09
    lat = []
    for i in range(-6, 7):
        o = i * w * 0.2
        lat.append(f'M{o - h} {-h} L{o + h} {h} M{o + h} {-h} L{o - h} {h}')
    g = f'''<rect x="{-w / 2}" y="{-h / 2}" width="{w}" height="{h}" rx="{r}" fill="{INK}" transform="translate(0 6)" opacity=".5"/>
<rect x="{-w / 2}" y="{-h / 2}" width="{w}" height="{h}" rx="{r}" fill="url(#{frame})" stroke="{INK}" stroke-width="7"/>
<rect x="{-w / 2 + w * .08}" y="{-h / 2 + w * .08}" width="{w * .84}" height="{h - w * .16}" rx="{r * .6}" fill="url(#lacquer)"/>
<clipPath id="cl{frame}{w:.0f}"><rect x="{-w / 2 + w * .08}" y="{-h / 2 + w * .08}" width="{w * .84}" height="{h - w * .16}" rx="{r * .6}"/></clipPath>
<path clip-path="url(#cl{frame}{w:.0f})" d="{' '.join(lat)}" stroke="#f2c14e" stroke-width="{w * .012:.1f}" opacity=".28"/>
<circle r="{w * .27}" fill="#5e1212" stroke="url(#{frame})" stroke-width="{w * .03}"/>
{lotus(0, -w * .02, w * .19)}'''
    if glow:
        g = f'<rect x="{-w * .62}" y="{-h * .6}" width="{w * 1.24}" height="{h * 1.2}" rx="{r * 2}" fill="url(#cardGlow)"/>' + g
    return g


DEFS = '''<defs>
<linearGradient id="wordGold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff7c2"/><stop offset=".38" stop-color="#ffd54a"/><stop offset=".72" stop-color="#ff9a1f"/><stop offset="1" stop-color="#e5531a"/></linearGradient>
<linearGradient id="wordCream" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ffe9c4"/><stop offset="1" stop-color="#f5b56a"/></linearGradient>
<radialGradient id="fade" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="fGold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#fff0a8"/><stop offset=".45" stop-color="#f2c14e"/><stop offset="1" stop-color="#b8741c"/></linearGradient>
<linearGradient id="fBlue" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#bfe3ff"/><stop offset=".5" stop-color="#5b9fe0"/><stop offset="1" stop-color="#2d5a9e"/></linearGradient>
<linearGradient id="fPurple" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#f0c8ff"/><stop offset=".5" stop-color="#b061e0"/><stop offset="1" stop-color="#6a2a9e"/></linearGradient>
<radialGradient id="lacquer" cx="50%" cy="40%" r="70%">
  <stop offset="0" stop-color="#c8392b"/><stop offset=".6" stop-color="#7d1a1a"/><stop offset="1" stop-color="#4a0d0d"/></radialGradient>
<radialGradient id="cardGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#ffd978" stop-opacity=".9"/><stop offset=".6" stop-color="#ffb347" stop-opacity=".25"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#ffcf5a" stop-opacity=".55"/><stop offset=".5" stop-color="#ff8a3d" stop-opacity=".18"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
<linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#d8442f"/><stop offset="1" stop-color="#8e1d1d"/></linearGradient>
<radialGradient id="iconBg" cx="50%" cy="38%" r="75%">
  <stop offset="0" stop-color="#b8322a"/><stop offset=".55" stop-color="#6a1518"/><stop offset="1" stop-color="#2a0a0e"/></radialGradient>
</defs>'''


def fan(cx, cy, w, h, spread=17):
    """Three cards fanned from a pivot below their centre: blue, purple, then the glowing gold one on top."""
    pivot = h * 0.95
    out = []
    for ang, frame, glow in ((-spread, 'fBlue', False), (spread, 'fPurple', False), (0, 'fGold', True)):
        out.append(f'<g transform="translate({cx} {cy + pivot}) rotate({ang}) translate(0 {-pivot})">{card_back(w, h, frame, glow)}</g>')
    return '\n'.join(out)


def ribbon(cx, cy, w, text):
    h = 64
    tag = glyphs(text, 'LilitaOne-Regular.ttf', 38)
    tw = sum(a for _, a in tag) + 3 * (len(tag) - 1)
    x = cx - tw / 2
    letters = []
    for d, a in tag:
        letters.append(f'<path transform="translate({x:.1f} {cy + 13})" d="{d}"/>')
        x += a + 3
    hw = w / 2
    tail = 44
    return f'''<g stroke="{INK}" stroke-width="7" stroke-linejoin="round">
<path d="M{cx - hw + 10} {cy - h / 2 + 14} L{cx - hw - tail} {cy - h / 2 + 14} L{cx - hw - tail + 22} {cy + 10 + 14} L{cx - hw - tail} {cy + h / 2 + 14} L{cx - hw + 10} {cy + h / 2 + 14}Z" fill="#6a1518"/>
<path d="M{cx + hw - 10} {cy - h / 2 + 14} L{cx + hw + tail} {cy - h / 2 + 14} L{cx + hw + tail - 22} {cy + 10 + 14} L{cx + hw + tail} {cy + h / 2 + 14} L{cx + hw - 10} {cy + h / 2 + 14}Z" fill="#6a1518"/>
<path d="M{cx - hw} {cy - h / 2} Q{cx} {cy - h / 2 - 16} {cx + hw} {cy - h / 2} L{cx + hw} {cy + h / 2} Q{cx} {cy + h / 2 - 16} {cx - hw} {cy + h / 2}Z" fill="url(#ribbon)"/>
</g>
<path d="M{cx - hw + 12} {cy - h / 2 + 8} Q{cx} {cy - h / 2 - 7} {cx + hw - 12} {cy - h / 2 + 8}" stroke="#f2c14e" stroke-width="3" fill="none" opacity=".8"/>
<g fill="#fff1d6" stroke="{INK}" stroke-width="5" stroke-linejoin="round" paint-order="stroke">{"".join(letters)}</g>'''


def logo(W=1000, H=880):
    cx = W / 2
    body = [
        f'<ellipse cx="{cx}" cy="360" rx="440" ry="340" fill="url(#halo)"/>',
        burst(cx, 340, 500, 20, '#ffcf5a', .3),
        fan(cx, 205, 190, 270),
        word(arched('FOLK', 'LuckiestGuy-Regular.ttf', 150, cx, 530, 1100, 4), 'wordCream', 24, 10),
        word(arched('GACHA', 'LuckiestGuy-Regular.ttf', 220, cx, 712, 1300, 6), 'wordGold', 30, 12),
        ribbon(cx, 800, 460, 'SPIRITS OF LANKA'),
        star(cx - 300, 230, 26), star(cx + 318, 195, 34), star(cx + 352, 305, 13, '#fff1c4'),
        star(cx - 340, 355, 12, '#fff1c4'), star(cx + 120, 105, 16),
    ]
    return '\n'.join(body)


def icon(S=512):
    c = S / 2
    return '\n'.join([
        f'<rect width="{S}" height="{S}" fill="url(#iconBg)"/>',
        burst(c, c, S * .72, 20, '#ffcf5a', .28),
        f'<circle cx="{c}" cy="{c}" r="{S * .42}" fill="url(#halo)"/>',
        fan(c, S * .5 - S * .035, S * .3, S * .43, 18),
        star(S * .2, S * .2, S * .045), star(S * .82, S * .25, S * .055), star(S * .8, S * .78, S * .03, '#fff1c4'),
    ])


def favicon(S=64):
    c = S / 2
    w, h = S * .58, S * .82
    return f'''<rect width="{S}" height="{S}" rx="{S * .18}" fill="#7d1a1a"/>
<rect x="{c - w / 2}" y="{c - h / 2}" width="{w}" height="{h}" rx="{S * .07}" fill="url(#fGold)" stroke="{INK}" stroke-width="{S * .04}"/>
<rect x="{c - w / 2 + S * .06}" y="{c - h / 2 + S * .06}" width="{w - S * .12}" height="{h - S * .12}" rx="{S * .04}" fill="#8e1d1d"/>
{star(c, c, S * .2, '#fff3c0')}'''


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{DEFS}{rect}{body}</svg>\n'


if __name__ == '__main__':
    files = {
        'game-logo.svg': svg(1000, 880, logo()),
        'game-logo-dark.svg': svg(1000, 880, logo(), TABLE),
        'game-icon.svg': svg(512, 512, icon()),
        'game-favicon.svg': svg(64, 64, favicon()),
    }
    for name, text in files.items():
        with open(name, 'w', encoding='utf-8') as f:
            f.write(text)
        print('wrote', name)
