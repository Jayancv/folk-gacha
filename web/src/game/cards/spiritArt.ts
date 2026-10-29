// Placeholder creature silhouettes, one per spirit (template). Phase 4 replaces these
// with real art. Each glyph draws in a 100 x 100 box: `ink` for the body, `detail`
// for eyes and inner lines. Facing left, standing on y ≈ 90.

type Ctx = CanvasRenderingContext2D;
type Glyph = (ctx: Ctx, ink: string, detail: string) => void;

const TAU = Math.PI * 2;

function circle (ctx: Ctx, x: number, y: number, r: number)
{
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
}

function oval (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0)
{
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fill();
}

function leg (ctx: Ctx, x: number, y: number, w: number, h: number)
{
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w * 0.4);
    ctx.fill();
}

function poly (ctx: Ctx, pts: number[])
{
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2)
    {
        ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.closePath();
    ctx.fill();
}

/** Open stroke through a list of cubic segments: start x,y then (c1x,c1y,c2x,c2y,x,y)*. */
function curve (ctx: Ctx, width: number, pts: number[])
{
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 5 < pts.length; i += 6)
    {
        ctx.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
    }
    ctx.stroke();
}

/** A small scroll curl ending at (x, y), the volute used all over Sinhala ornament. */
function curl (ctx: Ctx, x: number, y: number, r: number, width: number, dir = 1)
{
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++)
    {
        const t = i / 24;
        const a = dir * t * TAU * 0.9;
        const rr = r * (1 - t * 0.75);
        const px = x + Math.cos(a) * rr - r;
        const py = y + Math.sin(a) * rr;
        if (i === 0)
        {
            ctx.moveTo(px, py);
        }
        else
        {
            ctx.lineTo(px, py);
        }
    }
    ctx.stroke();
}

function eye (ctx: Ctx, x: number, y: number, r: number, detail: string, ink: string)
{
    ctx.fillStyle = detail;
    circle(ctx, x, y, r);
    ctx.fillStyle = ink;
    circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.35);
}

/** Mane: a ring of overlapping lobes around (x, y). */
function mane (ctx: Ctx, x: number, y: number, r: number, lobes: number, lobeR: number)
{
    for (let i = 0; i < lobes; i++)
    {
        const a = (i / lobes) * TAU;
        circle(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, lobeR);
    }
}

const gajaCalf: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    oval(ctx, 60, 58, 26, 20);
    leg(ctx, 40, 64, 11, 24);
    leg(ctx, 53, 68, 11, 21);
    leg(ctx, 66, 68, 11, 21);
    leg(ctx, 76, 63, 11, 25);
    circle(ctx, 36, 44, 18);
    // Trunk curling up at the tip
    curve(ctx, 9, [24, 50, 16, 58, 14, 70, 18, 78]);
    curl(ctx, 24, 78, 4, 6, -1);
    curve(ctx, 3, [85, 52, 90, 56, 90, 62, 88, 66]);
    // Ear: a soft shaded flap
    ctx.fillStyle = detail;
    ctx.globalAlpha *= 0.2;
    oval(ctx, 47, 45, 10, 14, 0.15);
    ctx.globalAlpha /= 0.2;
    eye(ctx, 30, 41, 2.6, detail, ink);
};

const malu: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    poly(ctx, [68, 52, 92, 32, 86, 52, 92, 72]);
    ctx.beginPath();
    ctx.moveTo(34, 38);
    ctx.quadraticCurveTo(48, 14, 62, 38);
    ctx.fill();
    poly(ctx, [44, 64, 52, 78, 58, 64]);
    oval(ctx, 46, 52, 29, 17);
    // Bubbles
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(14, 32, 4, 0, TAU);
    ctx.moveTo(23, 20);
    ctx.arc(20, 20, 3, 0, TAU);
    ctx.moveTo(12.5, 12);
    ctx.arc(11, 12, 1.5, 0, TAU);
    ctx.stroke();
    // Gill and scales
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(26, 52, 14, -0.7, 0.7);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const [x, y] of [[48, 46], [58, 46], [53, 55], [63, 55], [48, 60]])
    {
        ctx.beginPath();
        ctx.arc(x, y, 4, -1.2, 1.2);
        ctx.stroke();
    }
    ctx.globalAlpha /= 0.5;
    eye(ctx, 28, 48, 3.4, detail, ink);
};

const monara: Glyph = (ctx, ink, detail) =>
{
    // Tail fan behind the body
    for (let i = 0; i < 7; i++)
    {
        const a = Math.PI * (1.08 + i * 0.14);
        const fx = 58 + Math.cos(a) * 30;
        const fy = 64 + Math.sin(a) * 30;
        ctx.fillStyle = ink;
        ctx.globalAlpha *= 0.85;
        oval(ctx, fx, fy, 7, 13, a + Math.PI / 2);
        ctx.globalAlpha /= 0.85;
        ctx.fillStyle = detail;
        ctx.globalAlpha *= 0.55;
        circle(ctx, 58 + Math.cos(a) * 36, 64 + Math.sin(a) * 36, 3);
        ctx.globalAlpha /= 0.55;
    }
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    oval(ctx, 50, 68, 15, 17);
    oval(ctx, 44, 54, 7, 11, -0.3);
    circle(ctx, 41, 42, 9);
    poly(ctx, [33, 40, 26, 44, 33, 46]);
    // Crest
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(41, 34); ctx.lineTo(36, 24);
    ctx.moveTo(42, 33); ctx.lineTo(42, 22);
    ctx.moveTo(43, 34); ctx.lineTo(48, 24);
    ctx.stroke();
    circle(ctx, 36, 23, 2.2);
    circle(ctx, 42, 21, 2.2);
    circle(ctx, 48, 23, 2.2);
    // Legs
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(45, 82); ctx.lineTo(44, 92);
    ctx.moveTo(55, 82); ctx.lineTo(56, 92);
    ctx.stroke();
    eye(ctx, 38, 41, 2.2, detail, ink);
};

const ura: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // Bristles along the back
    poly(ctx, [40, 44, 46, 34, 52, 42, 58, 32, 64, 42, 70, 34, 76, 44]);
    oval(ctx, 58, 60, 28, 18);
    leg(ctx, 38, 66, 10, 22);
    leg(ctx, 50, 70, 10, 18);
    leg(ctx, 66, 70, 10, 18);
    leg(ctx, 76, 66, 10, 22);
    oval(ctx, 34, 58, 16, 13);
    ctx.beginPath();
    ctx.roundRect(11, 52, 16, 13, 5);
    ctx.fill();
    poly(ctx, [36, 47, 42, 34, 48, 49]);
    curl(ctx, 92, 54, 5, 3, 1);
    // Tusk, nostrils, eye
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.7;
    curve(ctx, 2.6, [22, 66, 20, 62, 22, 58, 26, 57]);
    ctx.globalAlpha /= 0.7;
    ctx.fillStyle = detail;
    circle(ctx, 15, 57, 1.5);
    circle(ctx, 15, 61, 1.5);
    eye(ctx, 32, 53, 2.4, detail, ink);
};

const simha: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // Tail with tuft
    curve(ctx, 4, [64, 80, 78, 82, 84, 72, 82, 64]);
    circle(ctx, 82, 62, 5);
    oval(ctx, 50, 72, 18, 17);
    oval(ctx, 41, 88, 7, 4.5);
    oval(ctx, 59, 88, 7, 4.5);
    // Flame mane
    mane(ctx, 50, 40, 20, 12, 8.5);
    circle(ctx, 50, 40, 21);
    // Face ring and features
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(50, 42, 14, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha /= 0.45;
    eye(ctx, 44, 39, 2.6, detail, ink);
    eye(ctx, 56, 39, 2.6, detail, ink);
    ctx.fillStyle = detail;
    poly(ctx, [47, 45, 53, 45, 50, 49]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(47, 50, 3, 0.2, Math.PI - 0.2);
    ctx.arc(53, 50, 3, 0.2, Math.PI - 0.2);
    ctx.stroke();
};

const gajasinghe: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    curve(ctx, 4, [82, 54, 92, 50, 94, 40, 90, 34]);
    circle(ctx, 89, 32, 5);
    oval(ctx, 62, 58, 25, 15);
    leg(ctx, 42, 62, 10, 27);
    leg(ctx, 54, 64, 9, 25);
    leg(ctx, 70, 64, 9, 25);
    leg(ctx, 80, 60, 10, 29);
    mane(ctx, 40, 42, 16, 11, 7.5);
    circle(ctx, 40, 42, 17);
    // Elephant head: trunk and tusk
    curve(ctx, 8, [28, 48, 20, 56, 16, 66, 20, 76]);
    curl(ctx, 26, 76, 4, 5.5, -1);
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.7;
    curve(ctx, 2.8, [30, 55, 26, 62, 22, 64, 18, 62]);
    ctx.globalAlpha /= 0.7;
    ctx.fillStyle = detail;
    ctx.globalAlpha *= 0.2;
    oval(ctx, 46, 43, 8, 11, 0.2);
    ctx.globalAlpha /= 0.2;
    eye(ctx, 33, 39, 2.6, detail, ink);
};

const serapendiya: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // Sweeping scroll tail
    curve(ctx, 5, [64, 56, 78, 50, 84, 36, 80, 26]);
    curl(ctx, 86, 26, 6, 4.5, -1);
    curve(ctx, 5, [64, 64, 80, 70, 90, 66, 92, 58]);
    curl(ctx, 98, 58, 5, 4, -1);
    oval(ctx, 52, 58, 19, 14, -0.35);
    circle(ctx, 36, 40, 10);
    // Curled beak
    curve(ctx, 4.5, [27, 40, 20, 42, 16, 50, 20, 56]);
    curl(ctx, 26, 56, 3.5, 3.5, -1);
    // Crest scroll
    curve(ctx, 3.5, [38, 31, 38, 24, 44, 18, 50, 20]);
    curl(ctx, 52, 24, 4, 3, 1);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(48, 70); ctx.lineTo(46, 86);
    ctx.moveTo(56, 70); ctx.lineTo(58, 86);
    ctx.stroke();
    // Wing scrolls
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.5;
    curve(ctx, 2, [44, 56, 50, 50, 60, 50, 64, 56]);
    curve(ctx, 2, [46, 63, 52, 58, 60, 58, 64, 63]);
    ctx.globalAlpha /= 0.5;
    eye(ctx, 33, 38, 2.6, detail, ink);
};

const nagaRaksha: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // Crown of five cobras
    for (let i = 0; i < 5; i++)
    {
        const a = Math.PI * (1.1 + i * 0.2);
        const hx = 50 + Math.cos(a) * 36;
        const hy = 54 + Math.sin(a) * 36;
        curve(ctx, 6, [50 + Math.cos(a) * 14, 54 + Math.sin(a) * 14, 50 + Math.cos(a) * 22, 54 + Math.sin(a) * 26, hx, hy + 6, hx, hy]);
        oval(ctx, hx, hy, 6, 8, a + Math.PI / 2);
        ctx.fillStyle = detail;
        circle(ctx, hx + Math.cos(a + 1.6) * 2.4, hy + Math.sin(a + 1.6) * 2.4, 1.2);
        circle(ctx, hx + Math.cos(a - 1.6) * 2.4, hy + Math.sin(a - 1.6) * 2.4, 1.2);
        ctx.fillStyle = ink;
    }
    // Mask face
    oval(ctx, 50, 62, 21, 25);
    poly(ctx, [29, 60, 22, 54, 24, 66]);
    poly(ctx, [71, 60, 78, 54, 76, 66]);
    // Bulging eyes, brows, fanged mouth
    ctx.fillStyle = detail;
    circle(ctx, 42, 56, 6.5);
    circle(ctx, 58, 56, 6.5);
    ctx.fillStyle = ink;
    circle(ctx, 42, 56, 2.6);
    circle(ctx, 58, 56, 2.6);
    ctx.strokeStyle = detail;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(34, 47); ctx.quadraticCurveTo(42, 42, 48, 48);
    ctx.moveTo(66, 47); ctx.quadraticCurveTo(58, 42, 52, 48);
    ctx.stroke();
    ctx.fillStyle = detail;
    ctx.beginPath();
    ctx.roundRect(38, 70, 24, 9, 4);
    ctx.fill();
    ctx.fillStyle = ink;
    poly(ctx, [40, 70, 44, 70, 42, 77]);
    poly(ctx, [56, 70, 60, 70, 58, 77]);
    ctx.fillStyle = detail;
    poly(ctx, [48, 60, 52, 60, 50, 66]);
};

const guruluRaksha: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // Spread wings
    poly(ctx, [46, 50, 8, 26, 14, 40, 4, 44, 14, 54, 6, 62, 18, 68, 44, 66]);
    poly(ctx, [54, 50, 92, 26, 86, 40, 96, 44, 86, 54, 94, 62, 82, 68, 56, 66]);
    oval(ctx, 50, 64, 13, 20);
    circle(ctx, 50, 38, 12);
    // Crown spikes
    poly(ctx, [41, 30, 43, 18, 47, 28, 50, 14, 53, 28, 57, 18, 59, 30]);
    // Talons
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(44, 82); ctx.lineTo(40, 92);
    ctx.moveTo(56, 82); ctx.lineTo(60, 92);
    ctx.stroke();
    // Feather lines
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.45;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of [[42, 54, 16, 40], [42, 58, 14, 52], [42, 62, 18, 62], [58, 54, 84, 40], [58, 58, 86, 52], [58, 62, 82, 62]])
    {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    ctx.globalAlpha /= 0.45;
    // Hooked beak holding a cobra
    ctx.fillStyle = detail;
    ctx.beginPath();
    ctx.moveTo(45, 42);
    ctx.quadraticCurveTo(50, 60, 54, 50);
    ctx.quadraticCurveTo(56, 46, 55, 42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = detail;
    curve(ctx, 3, [30, 56, 36, 48, 42, 60, 50, 52, 58, 46, 64, 58, 72, 50]);
    ctx.fillStyle = detail;
    oval(ctx, 73, 49, 3.5, 2.5, -0.4);
    eye(ctx, 45, 35, 2.4, detail, ink);
    eye(ctx, 55, 35, 2.4, detail, ink);
};

const makara: Glyph = (ctx, ink, detail) =>
{
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // Fish body sweeping back into a scroll tail
    curve(ctx, 15, [40, 54, 56, 40, 70, 70, 86, 50]);
    curl(ctx, 94, 44, 7, 5, -1);
    poly(ctx, [84, 52, 98, 66, 86, 62]);
    leg(ctx, 38, 60, 9, 28);
    leg(ctx, 56, 58, 9, 24);
    oval(ctx, 34, 50, 15, 12);
    // Elephant trunk upper jaw, curling up
    curve(ctx, 7, [24, 44, 12, 40, 8, 28, 16, 20]);
    curl(ctx, 22, 20, 5, 4.5, 1);
    // Open lower jaw
    poly(ctx, [24, 56, 8, 62, 12, 66, 30, 62]);
    // Crest scrolls
    curve(ctx, 3.5, [38, 40, 40, 32, 46, 28, 52, 30]);
    curl(ctx, 54, 34, 4, 3, 1);
    // Teeth, scales, eye
    ctx.fillStyle = detail;
    poly(ctx, [14, 61, 16, 57, 18, 61]);
    poly(ctx, [20, 60, 22, 56, 24, 60]);
    ctx.strokeStyle = detail;
    ctx.globalAlpha *= 0.45;
    ctx.lineWidth = 1.5;
    for (const [x, y] of [[50, 50], [58, 52], [66, 58], [74, 56]])
    {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, -1.2, 1.2);
        ctx.stroke();
    }
    ctx.globalAlpha /= 0.45;
    eye(ctx, 32, 46, 2.8, detail, ink);
};

export const SPIRIT_GLYPHS: Record<string, Glyph> = {
    'gaja-calf': gajaCalf,
    'malu': malu,
    'monara': monara,
    'ura': ura,
    'simha': simha,
    'gajasinghe': gajasinghe,
    'serapendiya': serapendiya,
    'naga-raksha': nagaRaksha,
    'gurulu-raksha': guruluRaksha,
    'makara': makara
};

/** Draws the spirit for `templateId` into the square (x, y, size). Returns false if unknown. */
export function drawSpirit (ctx: Ctx, templateId: string, x: number, y: number, size: number, ink: string, detail: string): boolean
{
    const glyph = SPIRIT_GLYPHS[templateId];
    if (!glyph)
    {
        return false;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 100, size / 100);
    glyph(ctx, ink, detail);
    ctx.restore();
    return true;
}
