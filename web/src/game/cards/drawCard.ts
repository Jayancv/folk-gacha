// Draws card faces and backs onto a 2D canvas. Layout follows the .card styles in
// docs/design/lanka-mythics-preview.html, where 1u = 1% of the card width.
// Placeholder art for Phase 1: card-season cards get a spirit silhouette over their
// trait art (pattern, palette, prefix tint/effect, stamp, foil); plain template cards
// fall back to an element gradient + element icon.

import { darken, lighten, luminance, mix } from './color';
import { ELEMENT_STYLE, PALETTE, RARITY_STYLE, type CardData, type SeasonCardInfo } from './model';
import { seededRandom } from './seededRandom';
import { drawSpirit } from './spiritArt';
import { spiritImage } from './spiritImages';
import { ellipsize, wrap } from './textLayout';
import {
    archPath,
    drawAccessory,
    drawEffect,
    drawHoloSheen,
    drawPattern,
    drawStamp,
    drawTexture,
    drawTint,
    foilFrame,
    type Box
} from './traitArt';

// Card size in design units (5:7).
export const CARD_W = 216;
export const CARD_H = 302;

const DISPLAY_FONT = 'Georgia, "Noto Serif Sinhala", "Iskoola Pota", "Sinhala Sangam MN", serif';
const BODY_FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans Sinhala", "Nirmala UI", sans-serif';

type Ctx = CanvasRenderingContext2D;

const U = CARD_W / 100;

/** Where everything sits on a card face, in design units. Shared by the face and its glint. */
export interface FaceLayout
{
    pad: number;
    left: number;
    right: number;
    innerW: number;
    gap: number;
    badge: number;
    /** Top of the name row. */
    nameTop: number;
    /** Top of the traits line, when the card has one. */
    subtitleTop: number | null;
    subtitleSize: number;
    art: Box;
    artRadius: number;
    metaTop: number;
    metaH: number;
    statsTop: number;
    statsH: number;
    loreTop: number;
    loreSize: number;
    loreLine: number;
}

export function faceLayout (card: CardData): FaceLayout
{
    const u = U;
    const pad = 2.8 * u;
    const ph = CARD_H - pad * 2;
    const left = pad + 3.6 * u;
    const right = CARD_W - pad - 3.6 * u;
    const gap = 1.8 * u;
    const badge = 9.5 * u;
    const nameTop = pad + 3.2 * u;
    const subtitleSize = 3.7 * u;

    let y = nameTop + badge + gap * 0.6;
    let subtitleTop: number | null = null;
    if (card.season?.subtitle)
    {
        subtitleTop = y;
        y += subtitleSize * 1.1 + gap * 0.6;
    }
    else
    {
        y += gap * 0.4;
    }

    // Fixed-height rows below the art, measured from the bottom up.
    const loreSize = 3.6 * u, loreLine = loreSize * 1.3;
    const bottom = pad + ph - 3.6 * u;
    const loreTop = bottom - loreLine * 2;
    const statsH = 5.4 * u;
    const statsTop = loreTop - gap - statsH;
    const metaH = 5.7 * u;
    const metaTop = statsTop - gap - metaH;
    const artBottom = metaTop - gap;

    return {
        pad, left, right, innerW: right - left, gap, badge, nameTop, subtitleTop, subtitleSize,
        art: { x: left, y, w: right - left, h: artBottom - y }, artRadius: 3.2 * u,
        metaTop, metaH, statsTop, statsH, loreTop, loreSize, loreLine
    };
}

// Returns a canvas of (CARD_W * scale) x (CARD_H * scale) device pixels.
export function drawCardFace (card: CardData, scale: number): HTMLCanvasElement
{
    const { canvas, ctx } = makeCanvas(scale);
    const u = U;
    const L = faceLayout(card);
    const rarity = RARITY_STYLE[card.rarity];
    const season = card.season;
    const foil = season ? foilFrame(season.art.foil) : null;

    // Frame: rarity gradient (or foil) showing as a border around the panel.
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 6 * u);
    ctx.fillStyle = linear(ctx, 0, 0, CARD_W, CARD_H, foil ?? rarity.frame);
    ctx.fill();
    if (foil)
    {
        // Foil cards keep a rarity-coloured inner edge so the rarity still reads.
        ctx.strokeStyle = rarity.color;
        ctx.lineWidth = 0.9 * u;
        roundRect(ctx, 1.9 * u, 1.9 * u, CARD_W - 3.8 * u, CARD_H - 3.8 * u, 4.8 * u);
        ctx.stroke();
    }

    // Panel
    const { pad, left, right, innerW, badge, metaTop, metaH, statsTop, statsH, loreTop, loreSize, loreLine } = L;
    roundRect(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 4.2 * u);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();

    // Top row: name + element badge
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `800 ${7.6 * u}px ${DISPLAY_FONT}`;
    ctx.fillText(ellipsize(ctx, season?.title ?? card.name, innerW - badge - 2 * u), left, L.nameTop + badge / 2);
    drawElementBadge(ctx, card, right - badge / 2, L.nameTop + badge / 2, badge);

    // Traits line: "Brightly Moonlit · of Kandy"
    if (season && L.subtitleTop !== null)
    {
        ctx.font = `italic 600 ${L.subtitleSize}px ${DISPLAY_FONT}`;
        ctx.fillStyle = PALETTE.gold;
        ctx.fillText(ellipsize(ctx, season.subtitle, innerW), left, L.subtitleTop + L.subtitleSize * 0.55);
    }

    const a = L.art;
    if (season)
    {
        drawSeasonArt(ctx, card, season, a, L.artRadius);
    }
    else
    {
        drawArt(ctx, card, a.x, a.y, a.w, a.h, L.artRadius);
    }

    // Meta: Sinhala name + rarity label
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${5.2 * u}px ${DISPLAY_FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(ellipsize(ctx, card.nameSi, innerW * 0.6), left, metaTop + metaH / 2);
    ctx.font = `700 ${3.5 * u}px ${BODY_FONT}`;
    ctx.fillStyle = rarity.color;
    ctx.textAlign = 'right';
    fillSpaced(ctx, rarity.label.toUpperCase(), right, metaTop + metaH / 2, 0.14 * 3.5 * u);
    ctx.textAlign = 'left';

    // Stats: score + level stars
    ctx.font = `700 ${5.4 * u}px ${BODY_FONT}`;
    ctx.fillStyle = PALETTE.ink;
    const scoreText = String(card.score);
    ctx.fillText(scoreText, left, statsTop + statsH / 2);
    const scoreW = ctx.measureText(scoreText).width;
    ctx.font = `400 ${3.4 * u}px ${BODY_FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('PTS', left + scoreW + 0.8 * u, statsTop + statsH / 2 + 0.4 * u);
    drawStars(ctx, card.level, right, statsTop + statsH / 2, 4.2 * u);

    // Lore, two lines max
    ctx.font = `400 ${loreSize}px ${BODY_FONT}`;
    ctx.fillStyle = PALETTE.muted;
    wrap(ctx, card.lore, innerW, 2).forEach((line, i) =>
    {
        ctx.fillText(line, left, loreTop + loreLine * (i + 0.5));
    });

    return canvas;
}

/** The square the creature is drawn in, inside the art window. */
function creatureBox (b: Box): Box
{
    const size = Math.min(b.w * 0.86, b.h * 0.92);
    return { x: b.x + b.w / 2 - size / 2, y: b.y + b.h * 0.5 - size * 0.47, w: size, h: size };
}

/** Strength of the moving shine per rarity: how bright, and seconds between sweeps. */
export const SHINE: Record<CardData['rarity'], { alpha: number; every: [number, number] }> = {
    common: { alpha: 0.35, every: [6, 10] },
    uncommon: { alpha: 0.45, every: [5, 8] },
    rare: { alpha: 0.55, every: [4, 6.5] },
    epic: { alpha: 0.7, every: [3, 5] },
    legendary: { alpha: 0.85, every: [2.2, 3.6] }
};

/**
 * The shine mask for a card: its pattern lines and frame rim in white on transparent,
 * lined up exactly with the face. A moving light band is masked by this, so only the
 * pattern and rim catch the light. Foil cards also get a soft wash over the whole art.
 * Returns null for cards without season art (nothing to shine).
 */
export function drawCardGlint (card: CardData, scale: number): HTMLCanvasElement | null
{
    const season = card.season;
    if (!season)
    {
        return null;
    }
    const { canvas, ctx } = makeCanvas(scale);
    const L = faceLayout(card);
    const u = U;
    const { art } = season;

    // Frame rim
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6 * u;
    roundRect(ctx, 1.2 * u, 1.2 * u, CARD_W - 2.4 * u, CARD_H - 2.4 * u, 5.2 * u);
    ctx.stroke();

    ctx.save();
    roundRect(ctx, L.art.x, L.art.y, L.art.w, L.art.h, L.artRadius);
    ctx.clip();
    if (art.foil !== 'none')
    {
        ctx.fillStyle = art.foil === 'holo' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
        ctx.fillRect(L.art.x, L.art.y, L.art.w, L.art.h);
    }
    // Same pattern, same seed as the face, so the lines match exactly.
    drawPattern(ctx, art.pattern, L.art, '#ffffff', 1, seededRandom(art.seed));

    // Cut the creature out, so the light passes behind it instead of over it.
    const c = creatureBox(L.art);
    ctx.globalCompositeOperation = 'destination-out';
    const painted = spiritImage(card.templateId, card.level);
    if (painted)
    {
        ctx.drawImage(painted, c.x, c.y, c.w, c.h);
    }
    else
    {
        drawSpirit(ctx, card.templateId, c.x, c.y, c.w, '#000', '#000');
    }
    ctx.restore();

    return canvas;
}

export function drawCardBack (scale: number): HTMLCanvasElement
{
    const { canvas, ctx } = makeCanvas(scale);

    roundRect(ctx, 0, 0, CARD_W, CARD_H, 6 * CARD_W / 100);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = PALETTE.backRed;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // The preview's back is a 100x140 SVG; reuse its geometry.
    const s = CARD_W / 100;
    ctx.scale(s, CARD_H / 140);
    ctx.strokeStyle = PALETTE.gold;
    ctx.fillStyle = PALETTE.gold;

    ctx.lineWidth = 1.2;
    roundRect(ctx, 4, 4, 92, 132, 6);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.5;
    roundRect(ctx, 7, 7, 86, 126, 4);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Lotus rings
    ctx.lineWidth = 1;
    for (const [r, n, rx, ry] of [[11, 8, 4.5, 8], [22, 12, 5.5, 10], [33, 16, 5.5, 11]])
    {
        for (let i = 0; i < n; i++)
        {
            ctx.save();
            ctx.translate(50, 70);
            ctx.rotate((Math.PI * 2 / n) * i);
            ctx.beginPath();
            ctx.ellipse(0, -r, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
    ctx.lineWidth = 0.7;
    ctx.setLineDash([0.6, 3]);
    ctx.beginPath();
    ctx.arc(50, 70, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(50, 70, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = PALETTE.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${8 * s}px ${DISPLAY_FONT}`;
    ctx.fillText('Folk Gacha', CARD_W / 2, 12 * s);
    ctx.font = `800 ${6.4 * s}px ${DISPLAY_FONT}`;
    fillSpaced(ctx, 'LANKA MYTHICS', CARD_W / 2, CARD_H - 12 * s, 0.16 * 6.4 * s);

    return canvas;
}

function drawArt (ctx: Ctx, card: CardData, x: number, y: number, w: number, h: number, r: number)
{
    const [c1, c2] = card.rarity === 'legendary' ? ['#fff1c2', '#7a3d10'] : ELEMENT_STYLE[card.element].art;

    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();

    const g = ctx.createRadialGradient(x + w / 2, y + h * 0.42, 0, x + w / 2, y + h * 0.42, Math.max(w, h) * 0.72);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // Thorana arches
    const cx = x + w / 2;
    ctx.strokeStyle = '#fff3c4';
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = w * 0.015;
    archPath(ctx, cx, y + h, w * 0.41, h * 0.41);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = w * 0.02;
    ctx.lineCap = 'round';
    ctx.setLineDash([0.1, w * 0.05]);
    archPath(ctx, cx, y + h, w * 0.34, h * 0.39);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ground shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.91, w * 0.27, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // Placeholder creature: big element icon
    ctx.globalAlpha = 0.92;
    const size = Math.min(w, h) * 0.56;
    drawIcon(ctx, card, cx - size / 2, y + h * 0.5 - size / 2, size, '#ffffff');
    ctx.globalAlpha = 1;

    // Inner edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();

    ctx.restore();
}

// Card-season art, back to front: palette background, pattern, element halo,
// light effects, creature, prefix tint/texture, front effects, accessory, holo, stamp, set no.
function drawSeasonArt (ctx: Ctx, card: CardData, season: SeasonCardInfo, b: Box, r: number)
{
    const { art } = season;
    const [base, accent] = art.palette;
    const rand = seededRandom(art.seed);
    const light = luminance(base) > 0.45;

    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.clip();

    const cx = b.x + b.w / 2;
    const g = ctx.createRadialGradient(cx, b.y + b.h * 0.42, 0, cx, b.y + b.h * 0.42, Math.max(b.w, b.h) * 0.75);
    g.addColorStop(0, lighten(base, light ? 0.2 : 0.28));
    g.addColorStop(1, darken(base, light ? 0.25 : 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    drawPattern(ctx, art.pattern, b, accent, light ? 0.3 : 0.22, rand);

    // Element halo keeps the element readable whatever the palette.
    const [halo] = ELEMENT_STYLE[card.element].art;
    const hg = ctx.createRadialGradient(cx, b.y + b.h * 0.52, 0, cx, b.y + b.h * 0.52, b.w * 0.42);
    hg.addColorStop(0, mix(halo, '#ffffff', 0.3));
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;

    drawEffect(ctx, art.effect, 'behind', art.intensity, b, rand);

    // Ground shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, b.y + b.h * 0.9, b.w * 0.3, b.h * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Creature, with a soft dark outline so it reads on light palettes too.
    // Painted art (spiritImages.ts) when the spirit has it, else the placeholder silhouette.
    const creature = creatureBox(b);
    const size = creature.w;
    const painted = spiritImage(card.templateId, card.level);
    // Light creature on dark palettes; on pale ones (ivory, temple gold) an element-coloured one.
    const badge = ELEMENT_STYLE[card.element].badge;
    const ink = light ? darken(badge, 0.2) : '#fff8ec';
    const detail = light ? '#fff8ec' : darken(mix(base, badge, 0.5), 0.45);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = size * 0.035;
    ctx.shadowOffsetY = size * 0.012;
    if (painted)
    {
        ctx.drawImage(painted, creature.x, creature.y, size, size);
    }
    else if (!drawSpirit(ctx, card.templateId, creature.x, creature.y, size, ink, detail))
    {
        drawIcon(ctx, card, cx - size * 0.3, creature.y + size * 0.2, size * 0.6, ink);
    }
    ctx.restore();

    drawTint(ctx, art.tint, art.intensity, b);
    drawTexture(ctx, art.texture, art.intensity, b, rand);
    drawEffect(ctx, art.effect, 'front', art.intensity, b, rand);
    // Vector accessories (hats, garlands) are sized for the silhouettes; painted art has its own.
    if (!painted)
    {
        drawAccessory(ctx, art.accessory, b, creature);
    }
    if (art.foil === 'holo')
    {
        drawHoloSheen(ctx, b, rand);
    }
    drawStamp(ctx, art.stamp, b, BODY_FONT);

    // Set number, e.g. #0042 / 1500
    const size2 = b.w * 0.055;
    ctx.font = `700 ${size2}px ${BODY_FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const label = `#${String(season.setNo).padStart(4, '0')} / ${season.setSize}`;
    const tw = ctx.measureText(label).width;
    ctx.beginPath();
    ctx.roundRect(b.x + b.w * 0.03, b.y + b.h - size2 * 1.9, tw + size2 * 0.9, size2 * 1.5, size2 * 0.4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,236,0.92)';
    ctx.fillText(label, b.x + b.w * 0.03 + size2 * 0.45, b.y + b.h - size2 * 0.75);

    // Inner edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r);
    ctx.stroke();

    ctx.restore();
}

function drawElementBadge (ctx: Ctx, card: CardData, cx: number, cy: number, size: number)
{
    ctx.fillStyle = ELEMENT_STYLE[card.element].badge;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    const icon = size * 0.62;
    drawIcon(ctx, card, cx - icon / 2, cy - icon / 2, icon, '#ffffff');
}

function drawIcon (ctx: Ctx, card: CardData, x: number, y: number, size: number, color: string)
{
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    for (const part of ELEMENT_STYLE[card.element].icon)
    {
        const path = new Path2D(part.d);
        if (part.stroke)
        {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.4;
            ctx.lineCap = 'round';
            ctx.stroke(path);
        }
        else
        {
            ctx.fillStyle = color;
            ctx.fill(path);
        }
    }
    ctx.restore();
}

function drawStars (ctx: Ctx, level: number, right: number, cy: number, size: number)
{
    const step = size * 1.1;
    for (let i = 0; i < 5; i++)
    {
        const cx = right - size / 2 - (4 - i) * step;
        ctx.fillStyle = i < level ? PALETTE.gold : '#5a4646';
        starPath(ctx, cx, cy, size / 2, size / 4.6);
        ctx.fill();
    }
}

function starPath (ctx: Ctx, cx: number, cy: number, outer: number, inner: number)
{
    ctx.beginPath();
    for (let i = 0; i < 10; i++)
    {
        const r = i % 2 ? inner : outer;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
}

function makeCanvas (scale: number)
{
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(CARD_W * scale);
    canvas.height = Math.ceil(CARD_H * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(canvas.width / CARD_W, canvas.height / CARD_H);
    return { canvas, ctx };
}

function roundRect (ctx: Ctx, x: number, y: number, w: number, h: number, r: number)
{
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function linear (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: string[])
{
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
}

// Letter-spaced text; honours textAlign left/center/right.
function fillSpaced (ctx: Ctx, text: string, x: number, y: number, spacing: number)
{
    const chars = [...text];
    const widths = chars.map(c => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    const align = ctx.textAlign;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    chars.forEach((c, i) =>
    {
        ctx.fillText(c, cx, y);
        cx += widths[i] + spacing;
    });
    ctx.textAlign = align;
}
