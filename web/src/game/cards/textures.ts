import type { Scene } from 'phaser';
import { CARD_H, CARD_W, drawCardBack, drawCardFace } from './drawCard';
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

// Drop every face texture for a card (all scales), e.g. when a pack is cleared.
export function releaseFaceTextures (scene: Scene, card: CardData): void
{
    const prefix = `card-face:${card.id}@`;
    for (const key of scene.textures.getTextureKeys())
    {
        if (key.startsWith(prefix))
        {
            scene.textures.remove(key);
        }
    }
}

export const FX = {
    glow: 'fx-glow',
    dot: 'fx-dot',
    star: 'fx-star',
    rays: 'fx-rays'
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
