import type { Scene } from 'phaser';
import { CARD_H, CARD_W, drawCardBack, drawCardFace, drawCardGlint } from './drawCard';
import type { CardData } from './model';

// Texture pixels per design unit, quantized so small zoom changes reuse textures.
// Pass (camera zoom x on-screen scale of the card). WebGL only mipmaps power-of-two
// textures, so a card is drawn at the resolution it is shown at rather than one big texture.
export function textureScaleFor (devicePxPerUnit: number): number
{
    return Math.min(6, Math.max(1, Math.ceil(devicePxPerUnit * 2) / 2));
}

export function faceTextureKey (card: CardData, scale: number): string
{
    return `card-face:${card.id}@${scale}`;
}

export function ensureFaceTexture (scene: Scene, card: CardData, scale: number): string
{
    const key = faceTextureKey(card, scale);
    if (!scene.textures.exists(key))
    {
        scene.textures.addCanvas(key, drawCardFace(card, scale));
    }
    return key;
}

export function ensureBackTexture (scene: Scene, scale: number): string
{
    const key = `card-back@${scale}`;
    if (!scene.textures.exists(key))
    {
        scene.textures.addCanvas(key, drawCardBack(scale));
    }
    return key;
}

/**
 * The card's shine mask (pattern + rim in white), or null if the card has no season art.
 * Drawn at most at 2 px per unit: it only masks a soft light band, so it needn't be sharper.
 */
export function ensureGlintTexture (scene: Scene, card: CardData, scale: number): string | null
{
    const s = Math.min(2, scale);
    const key = `card-glint:${card.id}@${s}`;
    if (!scene.textures.exists(key))
    {
        const canvas = drawCardGlint(card, s);
        if (!canvas)
        {
            return null;
        }
        scene.textures.addCanvas(key, canvas);
    }
    return key;
}

// Drop every face and glint texture for a card (all scales), e.g. when a pack is cleared.
export function releaseFaceTextures (scene: Scene, card: CardData): void
{
    const prefixes = [`card-face:${card.id}@`, `card-glint:${card.id}@`];
    for (const key of scene.textures.getTextureKeys())
    {
        if (prefixes.some(p => key.startsWith(p)))
        {
            scene.textures.remove(key);
        }
    }
}

export const FX = {
    glow: 'fx-glow',
    dot: 'fx-dot',
    star: 'fx-star',
    rays: 'fx-rays',
    ring: 'fx-ring',
    shine: 'fx-shine',
    shineHolo: 'fx-shine-holo'
} as const;

// Size of the glow texture in design units (card plus halo).
export const GLOW_PAD = 44;

export function ensureFxTextures (scene: Scene): void
{
    const add = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) =>
    {
        if (scene.textures.exists(key))
        {
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        draw(canvas.getContext('2d')!);
        scene.textures.addCanvas(key, canvas);
    };

    // Soft white halo around a card-shaped rounded rect, drawn at 2 px per unit.
    // White so it can be tinted per rarity.
    add(FX.glow, (CARD_W + GLOW_PAD * 2) * 2, (CARD_H + GLOW_PAD * 2) * 2, (ctx) =>
    {
        ctx.scale(2, 2);
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = '#ffffff';
        for (const blur of [36, 20, 10])
        {
            ctx.shadowBlur = blur * 2;
            ctx.beginPath();
            ctx.roundRect(GLOW_PAD, GLOW_PAD, CARD_W, CARD_H, 14);
            ctx.fill();
        }
    });

    add(FX.dot, 64, 64, (ctx) =>
    {
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
    });

    // Four-point sparkle
    add(FX.star, 96, 96, (ctx) =>
    {
        ctx.translate(48, 48);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 48);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 8; i++)
        {
            const r = i % 2 ? 7 : 48;
            const a = i * Math.PI / 4;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
    });

    // Soft ring for shockwaves
    add(FX.ring, 256, 256, (ctx) =>
    {
        const g = ctx.createRadialGradient(128, 128, 80, 128, 128, 126);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.7, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
    });

    // Shine band: a soft vertical stripe, brightest in the middle. Rotated and swept across cards.
    const band = (ctx: CanvasRenderingContext2D, colors: string[]) =>
    {
        const across = ctx.createLinearGradient(0, 0, 128, 0);
        across.addColorStop(0, 'rgba(255,255,255,0)');
        across.addColorStop(0.3, 'rgba(255,255,255,0.25)');
        across.addColorStop(0.5, 'rgba(255,255,255,1)');
        across.addColorStop(0.7, 'rgba(255,255,255,0.25)');
        across.addColorStop(1, 'rgba(255,255,255,0)');
        const along = ctx.createLinearGradient(0, 0, 0, 16);
        colors.forEach((c, i) => along.addColorStop(i / Math.max(1, colors.length - 1), c));
        ctx.fillStyle = along;
        ctx.fillRect(0, 0, 128, 16);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = across;
        ctx.fillRect(0, 0, 128, 16);
    };
    add(FX.shine, 128, 16, ctx => band(ctx, ['#ffffff']));
    add(FX.shineHolo, 128, 16, ctx =>
    {
        // Rainbow across the band for holo foil.
        const g = ctx.createLinearGradient(0, 0, 128, 0);
        ['#ff7ab6', '#ffd36e', '#8cf5a2', '#6ed3ff', '#b58cff'].forEach((c, i) => g.addColorStop(0.3 + i * 0.1, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 16);
        ctx.globalCompositeOperation = 'destination-in';
        band(ctx, ['#ffffff']);
    });

    // Light rays fading out from the centre
    add(FX.rays, 512, 512, (ctx) =>
    {
        ctx.translate(256, 256);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 256);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        const n = 14;
        for (let i = 0; i < n; i++)
        {
            const a = (i / n) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 256, a - 0.07, a + 0.07);
            ctx.closePath();
            ctx.fill();
        }
    });
}

// Warm radial background shared by the table scenes.
export const TABLE_BG = 'table-bg';

export function ensureTableBackground (scene: Scene): string
{
    if (!scene.textures.exists(TABLE_BG))
    {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        const g = ctx.createRadialGradient(256, 230, 0, 256, 256, 362);
        g.addColorStop(0, '#3d1d24');
        g.addColorStop(0.55, '#22131a');
        g.addColorStop(1, '#170e10');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
        scene.textures.addCanvas(TABLE_BG, canvas);
    }
    return TABLE_BG;
}
