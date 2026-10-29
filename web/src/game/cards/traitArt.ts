// Placeholder art for card-season traits (see server/seasons/s1/config.json):
// background patterns, prefix effects, accessories, textures, stamps and holo foil.
// Everything draws inside an art window (x, y, w, h) that the caller has clipped.
// `rand` is seeded from the card's art seed so details are identical on every device.

import { lighten, rgba } from './color';
import { between } from './seededRandom';

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;

const TAU = Math.PI * 2;

export interface Box
{
    x: number;
    y: number;
    w: number;
    h: number;
}

// ---------- Patterns ----------

type Pattern = (ctx: Ctx, b: Box, rand: Rand) => void;

/** Lens-shaped petal from (x, y) pointing at angle a. */
function petal (ctx: Ctx, x: number, y: number, len: number, width: number, a: number)
{
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len;
    const nx = -Math.sin(a) * width;
    const ny = Math.cos(a) * width;
    const mx = (x + tx) / 2;
    const my = (y + ty) / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty);
    ctx.quadraticCurveTo(mx - nx, my - ny, x, y);
    ctx.fill();
}

function rosette (ctx: Ctx, x: number, y: number, r: number, petals: number, turn = 0)
{
    for (let i = 0; i < petals; i++)
    {
        petal(ctx, x, y, r, r * 0.32, turn + (i / petals) * TAU);
    }
}

const PATTERNS: Record<string, Pattern> = {
    // Liyawala: flowing creeper vines with leaves at each turn.
    liyawala: (ctx, { x, y, w, h }) =>
    {
        const rows = 3;
        const amp = h * 0.07;
        const period = w / 2.5;
        ctx.lineWidth = w * 0.012;
        for (let r = 0; r < rows; r++)
        {
            const cy = y + h * (0.2 + r * 0.3);
            const phase = r * period / 2;
            ctx.beginPath();
            for (let px = x - 4; px <= x + w + 4; px += 2)
            {
                const py = cy + Math.sin(((px - x + phase) / period) * TAU) * amp;
                if (px === x - 4)
                {
                    ctx.moveTo(px, py);
                }
                else
                {
                    ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
            for (let k = -1; k < 4; k++)
            {
                const lx = x + k * period + period / 4 - phase;
                const up = lx + period / 2;
                petal(ctx, lx, cy - amp, w * 0.06, w * 0.02, -Math.PI / 2 - 0.5);
                petal(ctx, up, cy + amp, w * 0.06, w * 0.02, Math.PI / 2 - 0.5);
            }
        }
    },

    // Pala pethi: bands of upright lotus petals along the top and bottom.
    'pala-pethi': (ctx, { x, y, w, h }) =>
    {
        const n = 9;
        const step = w / n;
        for (let i = 0; i <= n; i++)
        {
            const px = x + i * step;
            petal(ctx, px, y + h * 0.2, h * 0.16, step * 0.32, -Math.PI / 2);
            petal(ctx, px + step / 2, y + h, h * 0.16, step * 0.32, -Math.PI / 2);
        }
        ctx.lineWidth = w * 0.01;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.2);
        ctx.lineTo(x + w, y + h * 0.2);
        ctx.moveTo(x, y + h * 0.84);
        ctx.lineTo(x + w, y + h * 0.84);
        ctx.stroke();
    },

    // Sandakada pahana: moonstone half rings rising from the bottom.
    sandakada: (ctx, { x, y, w, h }) =>
    {
        const cx = x + w / 2;
        const cy = y + h * 1.02;
        ctx.lineWidth = w * 0.012;
        for (let i = 1; i <= 6; i++)
        {
            ctx.beginPath();
            ctx.arc(cx, cy, w * 0.1 * i, Math.PI, 0);
            ctx.stroke();
        }
        const ring = w * 0.45;
        for (let i = 0; i < 13; i++)
        {
            const a = Math.PI + (i + 0.5) * (Math.PI / 13);
            petal(ctx, cx + Math.cos(a) * (ring - w * 0.05), cy + Math.sin(a) * (ring - w * 0.05), w * 0.06, w * 0.018, a);
        }
    },

    // Dumbara weave: diagonal lattice with diamonds at the crossings.
    dumbara: (ctx, { x, y, w, h }) =>
    {
        const step = w / 7;
        ctx.lineWidth = w * 0.008;
        ctx.beginPath();
        for (let k = -h; k < w + h; k += step)
        {
            ctx.moveTo(x + k, y);
            ctx.lineTo(x + k + h, y + h);
            ctx.moveTo(x + k, y + h);
            ctx.lineTo(x + k + h, y);
        }
        ctx.stroke();
        const d = step * 0.16;
        for (let i = 0; i * step / 2 <= w + step; i++)
        {
            for (let j = 0; j * step / 2 <= h + step; j++)
            {
                if ((i + j) % 2)
                {
                    continue;
                }
                const px = x + i * step / 2;
                const py = y + j * step / 2;
                ctx.beginPath();
                ctx.moveTo(px, py - d);
                ctx.lineTo(px + d, py);
                ctx.lineTo(px, py + d);
                ctx.lineTo(px - d, py);
                ctx.fill();
            }
        }
    },

    // Laksha lacquer: turned-wood bands of different widths with dot rows.
    laksha: (ctx, { x, y, w, h }) =>
    {
        const bands = [0.08, 0.03, 0.05, 0.02, 0.06, 0.03];
        let by = y + h * 0.06;
        bands.forEach((t, i) =>
        {
            ctx.fillRect(x, by, w, h * t);
            by += h * t + h * 0.05;
            if (i % 2 === 0)
            {
                for (let px = x + w * 0.04; px < x + w; px += w * 0.07)
                {
                    ctx.beginPath();
                    ctx.arc(px, by - h * 0.025, w * 0.008, 0, TAU);
                    ctx.fill();
                }
            }
        });
    },

    // Kandyan mural: wavy fill lines and dotted borders, like temple wall paintings.
    mural: (ctx, { x, y, w, h }) =>
    {
        ctx.lineWidth = w * 0.007;
        for (let r = 0; r < 9; r++)
        {
            const cy = y + h * (0.06 + r * 0.115);
            ctx.beginPath();
            for (let px = x; px <= x + w; px += 3)
            {
                const py = cy + Math.sin((px - x) / (w * 0.05) + r) * h * 0.012;
                if (px === x)
                {
                    ctx.moveTo(px, py);
                }
                else
                {
                    ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
            if (r % 3 === 1)
            {
                for (let px = x + w * 0.03; px < x + w; px += w * 0.05)
                {
                    ctx.beginPath();
                    ctx.arc(px, cy + h * 0.05, w * 0.009, 0, TAU);
                    ctx.fill();
                }
            }
        }
    },

    // Makara thorana: nested temple arches.
    thorana: (ctx, { x, y, w, h }) =>
    {
        const cx = x + w / 2;
        ctx.lineWidth = w * 0.015;
        archPath(ctx, cx, y + h, w * 0.43, h * 0.42);
        ctx.stroke();
        ctx.lineWidth = w * 0.02;
        ctx.lineCap = 'round';
        ctx.setLineDash([0.1, w * 0.05]);
        archPath(ctx, cx, y + h, w * 0.36, h * 0.4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = w * 0.01;
        archPath(ctx, cx, y + h, w * 0.29, h * 0.36);
        ctx.stroke();
    },

    // Lotus grid: rosettes on a staggered grid.
    'lotus-grid': (ctx, { x, y, w, h }) =>
    {
        const step = w / 4.5;
        for (let j = 0; j * step * 0.86 < h + step; j++)
        {
            for (let i = -1; i * step < w + step; i++)
            {
                const px = x + i * step + (j % 2 ? step / 2 : 0);
                const py = y + j * step * 0.86;
                rosette(ctx, px, py, step * 0.26, 8);
            }
        }
    }
};

export function archPath (ctx: Ctx, cx: number, baseY: number, halfW: number, rise: number)
{
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.lineTo(cx - halfW, baseY - rise);
    ctx.arc(cx, baseY - rise, halfW, Math.PI, 0);
    ctx.lineTo(cx + halfW, baseY);
}

export const PATTERN_IDS = Object.keys(PATTERNS);

/** Draws pattern `id` in `color` (unknown ids fall back to the thorana arches). */
export function drawPattern (ctx: Ctx, id: string, b: Box, color: string, alpha: number, rand: Rand)
{
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    (PATTERNS[id] ?? PATTERNS.thorana)(ctx, b, rand);
    ctx.restore();
}

// ---------- Prefix effects ----------

type Effect = (ctx: Ctx, b: Box, n: number, rand: Rand) => void;

function glow (ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number)
{
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function sparkle (ctx: Ctx, x: number, y: number, r: number)
{
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
}

const EFFECTS: Record<string, Effect> = {
    moonglow: (ctx, { x, y, w, h }, n) =>
    {
        const mx = x + w * 0.8;
        const my = y + h * 0.2;
        const r = w * 0.09;
        glow(ctx, mx, my, r * (3 + n), '#dfe6ff', 0.35 + 0.12 * n);
        ctx.fillStyle = '#f4f6ff';
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, TAU);
        ctx.arc(mx + r * 0.45, my - r * 0.2, r * 0.85, 0, TAU, true);
        ctx.fill();
    },

    sunrays: (ctx, { x, y, w, h }, n) =>
    {
        const sx = x + w * 0.12;
        const sy = y + h * 0.1;
        glow(ctx, sx, sy, w * (0.4 + 0.15 * n), '#fff1b8', 0.5 + 0.12 * n);
        ctx.fillStyle = rgba('#fff4c8', 0.1 + 0.05 * n);
        const rays = 7 + n * 2;
        for (let i = 0; i < rays; i++)
        {
            const a = (i / rays) * (Math.PI / 2) + 0.05;
            const a2 = a + 0.06;
            const len = w * 1.6;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
            ctx.lineTo(sx + Math.cos(a2) * len, sy + Math.sin(a2) * len);
            ctx.fill();
        }
    },

    rain: (ctx, { x, y, w, h }, n, rand) =>
    {
        ctx.strokeStyle = rgba('#e8f4ff', 0.45 + 0.1 * n);
        ctx.lineWidth = w * 0.008;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 14 * n + 10; i++)
        {
            const px = x + rand() * (w + h * 0.3);
            const py = y + rand() * h;
            const len = between(rand, 0.05, 0.11) * h;
            ctx.moveTo(px, py);
            ctx.lineTo(px - len * 0.3, py + len);
        }
        ctx.stroke();
    },

    mist: (ctx, { x, y, w, h }, n, rand) =>
    {
        for (let i = 0; i < 3 + n * 2; i++)
        {
            // Soft horizontal band: a unit radial gradient squashed into an ellipse.
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
            g.addColorStop(0, rgba('#ffffff', 0.18 + 0.06 * n));
            g.addColorStop(1, rgba('#ffffff', 0));
            ctx.save();
            ctx.translate(x + rand() * w, y + h * between(rand, 0.45, 1));
            ctx.scale(w * between(rand, 0.4, 0.7), h * 0.09);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
    },

    // Perahera oil lamps (pahana) along the bottom.
    lamps: (ctx, { x, y, w, h }, n) =>
    {
        const count = 3 + n * 2;
        for (let i = 0; i < count; i++)
        {
            const px = x + w * (i + 0.5) / count;
            const py = y + h * 0.92;
            const s = w * 0.035;
            glow(ctx, px, py - s * 1.6, s * 4, '#ffc45a', 0.45);
            ctx.fillStyle = '#ffd36b';
            petal(ctx, px, py - s * 0.6, s * 1.8, s * 0.45, -Math.PI / 2);
            ctx.fillStyle = '#8a4a1c';
            ctx.beginPath();
            ctx.ellipse(px, py, s * 1.3, s * 0.55, 0, 0, Math.PI);
            ctx.fill();
        }
    },

    embers: (ctx, { x, y, w, h }, n, rand) =>
    {
        for (let i = 0; i < 10 * n + 8; i++)
        {
            const px = x + rand() * w;
            const py = y + h * Math.pow(rand(), 0.6);
            const r = w * between(rand, 0.006, 0.016);
            glow(ctx, px, py, r * 3, '#ff8a3c', 0.22);
            ctx.fillStyle = '#ffd08a';
            ctx.beginPath();
            ctx.arc(px, py, r, 0, TAU);
            ctx.fill();
        }
    },

    lightning: (ctx, { x, y, w, h }, n, rand) =>
    {
        for (let b = 0; b < n; b++)
        {
            let px = x + w * between(rand, 0.15, 0.85);
            let py = y;
            ctx.beginPath();
            ctx.moveTo(px, py);
            while (py < y + h * 0.7)
            {
                px += w * between(rand, -0.08, 0.08);
                py += h * between(rand, 0.08, 0.14);
                ctx.lineTo(px, py);
            }
            ctx.strokeStyle = rgba('#d9c6ff', 0.5);
            ctx.lineWidth = w * 0.03;
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = w * 0.01;
            ctx.stroke();
        }
    },

    petals: (ctx, { x, y, w, h }, n, rand) =>
    {
        ctx.fillStyle = rgba('#ffc2d6', 0.85);
        for (let i = 0; i < 6 * n + 5; i++)
        {
            petal(ctx, x + rand() * w, y + rand() * h, w * between(rand, 0.04, 0.07), w * 0.014, rand() * TAU);
        }
    },

    bubbles: (ctx, { x, y, w, h }, n, rand) =>
    {
        ctx.strokeStyle = rgba('#ffffff', 0.65);
        ctx.lineWidth = w * 0.007;
        for (let i = 0; i < 6 * n + 5; i++)
        {
            const r = w * between(rand, 0.012, 0.04);
            const px = x + rand() * w;
            const py = y + rand() * h;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, TAU);
            ctx.stroke();
            ctx.fillStyle = rgba('#ffffff', 0.6);
            ctx.beginPath();
            ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.25, 0, TAU);
            ctx.fill();
        }
    },

    shadow: (ctx, { x, y, w, h }, n) =>
    {
        const g = ctx.createRadialGradient(x + w / 2, y + h * 0.55, w * 0.2, x + w / 2, y + h * 0.55, w * 0.75);
        g.addColorStop(0, 'rgba(10,0,25,0)');
        g.addColorStop(1, `rgba(10,0,25,${0.35 + 0.15 * n})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
    },

    dust: (ctx, { x, y, w, h }, n, rand) =>
    {
        ctx.fillStyle = rgba('#f3e2c0', 0.55);
        for (let i = 0; i < 25 * n + 20; i++)
        {
            ctx.beginPath();
            ctx.arc(x + rand() * w, y + rand() * h, w * between(rand, 0.002, 0.007), 0, TAU);
            ctx.fill();
        }
    },

    'gold-shimmer': (ctx, { x, y, w, h }, n, rand) =>
    {
        for (let i = 0; i < 5 * n + 4; i++)
        {
            const px = x + rand() * w;
            const py = y + rand() * h;
            const r = w * between(rand, 0.02, 0.045);
            glow(ctx, px, py, r * 2, '#ffe28a', 0.45);
            ctx.fillStyle = '#fff3c4';
            sparkle(ctx, px, py, r);
        }
    }
};

export const EFFECT_IDS = Object.keys(EFFECTS);

/** Effects drawn behind the creature (light sources); the rest go on top. */
const BEHIND = new Set(['moonglow', 'sunrays', 'lightning']);

export function drawEffect (ctx: Ctx, id: string | undefined, layer: 'behind' | 'front', intensity: number, b: Box, rand: Rand)
{
    const fx = id ? EFFECTS[id] : undefined;
    if (!fx || BEHIND.has(id!) !== (layer === 'behind'))
    {
        return;
    }
    ctx.save();
    fx(ctx, b, intensity, rand);
    ctx.restore();
}

// ---------- Tint, texture, accessories ----------

/** Colour wash from the prefix (Moonlit = pale blue, Golden = warm gold …). */
export function drawTint (ctx: Ctx, tint: string | undefined, intensity: number, b: Box)
{
    if (!tint)
    {
        return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.45 + 0.18 * intensity;
    ctx.fillStyle = tint;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.08 + 0.04 * intensity;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
}

export function drawTexture (ctx: Ctx, id: string | undefined, intensity: number, b: Box, rand: Rand)
{
    if (id !== 'carved-stone')
    {
        return;
    }
    ctx.save();
    // Weathered stone: desaturate, then mottle.
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.45 + 0.15 * intensity;
    ctx.fillStyle = '#808080';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 160; i++)
    {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(255,245,225,0.10)' : 'rgba(40,30,20,0.10)';
        ctx.beginPath();
        ctx.arc(b.x + rand() * b.w, b.y + rand() * b.h, b.w * between(rand, 0.005, 0.03), 0, TAU);
        ctx.fill();
    }
    ctx.strokeStyle = 'rgba(40,30,20,0.25)';
    ctx.lineWidth = b.w * 0.005;
    for (let i = 0; i < 3; i++)
    {
        let px = b.x + rand() * b.w;
        let py = b.y;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let k = 0; k < 6; k++)
        {
            px += b.w * between(rand, -0.06, 0.06);
            py += b.h * between(rand, 0.04, 0.1);
            ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();
}

const BUNTING = ['#c0392b', '#e7b54a', '#f6eadc', '#2e7d5b'];

/** Accessories that sit in front of the art: Perahera bunting, a lotus crown above the creature. */
export function drawAccessory (ctx: Ctx, id: string | undefined, b: Box, creature: Box)
{
    ctx.save();
    if (id === 'perahera-cloth')
    {
        // A garland of Perahera flags across the top.
        const sag = b.h * 0.08;
        const y0 = b.y + b.h * 0.04;
        ctx.strokeStyle = '#f6eadc';
        ctx.lineWidth = b.w * 0.006;
        ctx.beginPath();
        ctx.moveTo(b.x, y0);
        ctx.quadraticCurveTo(b.x + b.w / 2, y0 + sag * 2, b.x + b.w, y0);
        ctx.stroke();
        const flags = 9;
        for (let i = 0; i < flags; i++)
        {
            const t = (i + 0.5) / flags;
            const fx = b.x + b.w * t;
            const fy = y0 + sag * 2 * 2 * t * (1 - t);
            const fw = b.w / flags * 0.42;
            ctx.fillStyle = BUNTING[i % BUNTING.length];
            ctx.beginPath();
            ctx.moveTo(fx - fw, fy);
            ctx.lineTo(fx + fw, fy);
            ctx.lineTo(fx, fy + fw * 2.2);
            ctx.closePath();
            ctx.fill();
        }
    }
    else if (id === 'lotus-crown')
    {
        const cx = creature.x + creature.w / 2;
        const cy = creature.y + creature.h * 0.08;
        const s = creature.w * 0.09;
        glow(ctx, cx, cy, s * 3, '#ffd1e0', 0.5);
        ctx.fillStyle = '#f7a8c4';
        for (let i = -2; i <= 2; i++)
        {
            petal(ctx, cx, cy + s * 0.6, s * (1.6 - Math.abs(i) * 0.2), s * 0.45, -Math.PI / 2 + i * 0.42);
        }
        ctx.fillStyle = '#ffe28a';
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.5, s * 0.3, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

// ---------- Foil ----------

const HOLO = ['#ff7ab6', '#ffd36e', '#8cf5a2', '#6ed3ff', '#b58cff', '#ff7ab6'];

/** Holo foil: a rainbow sheen over the art. */
export function drawHoloSheen (ctx: Ctx, b: Box, rand: Rand)
{
    ctx.save();
    const tilt = between(rand, -0.25, 0.25);
    const g = ctx.createLinearGradient(b.x, b.y + b.h * tilt, b.x + b.w, b.y + b.h * (1 - tilt));
    HOLO.forEach((c, i) => g.addColorStop(i / (HOLO.length - 1), c));
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++)
    {
        const px = b.x + b.w * (0.15 + i * 0.32);
        ctx.beginPath();
        ctx.moveTo(px, b.y);
        ctx.lineTo(px + b.w * 0.08, b.y);
        ctx.lineTo(px - b.w * 0.2, b.y + b.h);
        ctx.lineTo(px - b.w * 0.28, b.y + b.h);
        ctx.fill();
    }
    ctx.restore();
}

/** Frame gradient stops for a foil, or null to keep the rarity frame. */
export function foilFrame (foil: string): string[] | null
{
    if (foil === 'gold')
    {
        return ['#fff3c4', '#e7b54a', '#9c5f18', '#ffe9a8', '#b97a22'];
    }
    if (foil === 'holo')
    {
        return HOLO;
    }
    return null;
}

// ---------- Stamps ----------

/** A small seal in the top-right corner of the art. */
export function drawStamp (ctx: Ctx, stamp: { id: string; label: string } | undefined, b: Box, font: string)
{
    if (!stamp)
    {
        return;
    }
    const r = b.w * 0.085;
    const cx = b.x + b.w - r * 1.35;
    const cy = b.y + r * 1.35;
    const first = stamp.id === 'first-edition';
    const ink = first ? '#e7b54a' : '#b3261e';

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = r * 0.4;
    if (stamp.id === 'postage')
    {
        // Perforated postage square
        const s = r * 1.7;
        ctx.fillStyle = '#f6eadc';
        ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i <= 6; i++)
        {
            const t = -s / 2 + (s * i) / 6;
            for (const [px, py] of [[cx + t, cy - s / 2], [cx + t, cy + s / 2], [cx - s / 2, cy + t], [cx + s / 2, cy + t]])
            {
                ctx.beginPath();
                ctx.arc(px, py, s * 0.045, 0, TAU);
                ctx.fill();
            }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = ink;
        ctx.lineWidth = r * 0.08;
        ctx.strokeRect(cx - s * 0.36, cy - s * 0.36, s * 0.72, s * 0.72);
        stampText(ctx, 'POST', cx, cy, r * 0.42, ink, font);
        ctx.restore();
        return;
    }

    ctx.fillStyle = rgba(ink, 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = lighten(ink, first ? 0.6 : 0.5);
    ctx.lineWidth = r * 0.08;
    ctx.setLineDash([r * 0.12, r * 0.1]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const fg = first ? '#3a2208' : '#f6eadc';
    if (stamp.id === 'lotus-seal')
    {
        ctx.fillStyle = fg;
        for (let i = -2; i <= 2; i++)
        {
            petal(ctx, cx, cy + r * 0.35, r * (0.62 - Math.abs(i) * 0.06), r * 0.16, -Math.PI / 2 + i * 0.45);
        }
    }
    else if (stamp.id === 'temple-seal')
    {
        // Dagoba (stupa) outline
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.2, r * 0.38, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(cx - r * 0.5, cy + r * 0.2, r, r * 0.14);
        ctx.fillRect(cx - r * 0.08, cy - r * 0.55, r * 0.16, r * 0.4);
    }
    else
    {
        stampText(ctx, first ? '1ST' : 'S1', cx, cy, r * (first ? 0.56 : 0.66), fg, font);
    }
    ctx.restore();
}

function stampText (ctx: Ctx, text: string, x: number, y: number, size: number, color: string, font: string)
{
    ctx.fillStyle = color;
    ctx.font = `800 ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.05);
}
