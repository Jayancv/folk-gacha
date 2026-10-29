// Draws card faces and backs onto a 2D canvas. Layout follows the .card styles in
// docs/design/lanka-mythics-preview.html, where 1u = 1% of the card width.
// Placeholder art for Phase 1: element gradient + big element icon.

import { ELEMENT_STYLE, PALETTE, RARITY_STYLE, type CardData } from './model';

// Card size in design units (5:7).
export const CARD_W = 216;
export const CARD_H = 302;

const DISPLAY_FONT = 'Georgia, "Noto Serif Sinhala", "Iskoola Pota", "Sinhala Sangam MN", serif';
const BODY_FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans Sinhala", "Nirmala UI", sans-serif';

type Ctx = CanvasRenderingContext2D;

// Returns a canvas of (CARD_W * scale) x (CARD_H * scale) device pixels.
export function drawCardFace (card: CardData, scale: number): HTMLCanvasElement
{
    const { canvas, ctx } = makeCanvas(scale);
    const u = CARD_W / 100;
    const rarity = RARITY_STYLE[card.rarity];

    // Frame: rarity gradient showing as a border around the panel.
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 6 * u);
    ctx.fillStyle = linear(ctx, 0, 0, CARD_W, CARD_H, rarity.frame);
    ctx.fill();

    // Panel
    const pad = 2.8 * u;
    const px = pad, py = pad, pw = CARD_W - pad * 2, ph = CARD_H - pad * 2;
    roundRect(ctx, px, py, pw, ph, 4.2 * u);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();

    const left = px + 3.6 * u;
    const right = px + pw - 3.6 * u;
    const innerW = right - left;
    const gap = 1.8 * u;
    let y = py + 3.2 * u;

    // Top row: name + element badge
    const badge = 9.5 * u;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `800 ${7.6 * u}px ${DISPLAY_FONT}`;
    ctx.fillText(ellipsize(ctx, card.name, innerW - badge - 2 * u), left, y + badge / 2);
    drawElementBadge(ctx, card, right - badge / 2, y + badge / 2, badge);
    y += badge + gap;

    // Fixed-height rows below the art, measured from the bottom up.
    const loreSize = 3.6 * u, loreLine = loreSize * 1.3;
    const bottom = py + ph - 3.6 * u;
    const loreTop = bottom - loreLine * 2;
    const statsH = 5.4 * u;
    const statsTop = loreTop - gap - statsH;
    const metaH = 5.7 * u;
    const metaTop = statsTop - gap - metaH;
    const artBottom = metaTop - gap;

    drawArt(ctx, card, left, y, innerW, artBottom - y, 3.2 * u);

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
    ctx.fillText('ලංකා', CARD_W / 2, 12 * s);
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

function archPath (ctx: Ctx, cx: number, baseY: number, halfW: number, rise: number)
{
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.lineTo(cx - halfW, baseY - rise);
    ctx.arc(cx, baseY - rise, halfW, Math.PI, 0);
    ctx.lineTo(cx + halfW, baseY);
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

function ellipsize (ctx: Ctx, text: string, maxW: number): string
{
    if (ctx.measureText(text).width <= maxW)
    {
        return text;
    }
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW)
    {
        t = t.slice(0, -1);
    }
    return t.trimEnd() + '…';
}

function wrap (ctx: Ctx, text: string, maxW: number, maxLines: number): string[]
{
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++)
    {
        const test = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(test).width <= maxW || !line)
        {
            line = test;
            continue;
        }
        if (lines.length === maxLines - 1)
        {
            lines.push(ellipsize(ctx, `${line} ${words.slice(i).join(' ')}`, maxW));
            return lines;
        }
        lines.push(line);
        line = words[i];
    }
    if (line)
    {
        lines.push(line);
    }
    return lines;
}
