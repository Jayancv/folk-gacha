import { BlendModes, GameObjects, type Scene } from 'phaser';
import { PALETTE, RARITIES, RARITY_STYLE, rarityRank, type Rarity } from './model';
import { prefersReducedMotion, REVEAL_FX } from './revealFx';
import { FX } from './textures';

// Shared reveal/merge effects. Call ensureFxTextures(scene) before using these.

export interface Bursts
{
    /** Particle burst + sparkles sized for a rarity (counts from REVEAL_FX unless given). */
    play (rarity: Rarity, x: number, y: number, scale?: number): void;
}

export function createBursts (scene: Scene, depth: number): Bursts
{
    const dots = new Map<Rarity, GameObjects.Particles.ParticleEmitter>();
    const stars = new Map<Rarity, GameObjects.Particles.ParticleEmitter>();

    for (const rarity of RARITIES)
    {
        const tint = RARITY_STYLE[rarity].glow ?? 0xf6eadc;
        const strength = 1 + rarityRank(rarity) * 0.35;

        dots.set(rarity, scene.add.particles(0, 0, FX.dot, {
            emitting: false,
            speed: { min: 60 * strength, max: 340 * strength },
            angle: { min: 0, max: 360 },
            lifespan: { min: 450, max: 1000 + rarityRank(rarity) * 200 },
            scale: { start: 0.42, end: 0 },
            alpha: { start: 1, end: 0 },
            gravityY: 260,
            tint,
            blendMode: 'ADD'
        }).setDepth(depth));

        stars.set(rarity, scene.add.particles(0, 0, FX.star, {
            emitting: false,
            speed: { min: 120 * strength, max: 420 * strength },
            angle: { min: 0, max: 360 },
            lifespan: { min: 700, max: 1400 },
            scale: { start: 0.5, end: 0 },
            rotate: { min: 0, max: 180 },
            alpha: { start: 1, end: 0 },
            tint: [tint, 0xffffff],
            blendMode: 'ADD'
        }).setDepth(depth));
    }

    return {
        play (rarity, x, y, scale = 1)
        {
            const fx = REVEAL_FX[rarity];
            dots.get(rarity)!.explode(Math.round(fx.burst * scale), x, y);
            if (fx.sparkles > 0)
            {
                stars.get(rarity)!.explode(Math.round(fx.sparkles * scale), x, y);
            }
        }
    };
}

// Camera shake/flash for a rarity, skipped when the player prefers reduced motion.
export function cameraFx (scene: Scene, rarity: Rarity): void
{
    if (prefersReducedMotion())
    {
        return;
    }
    const fx = REVEAL_FX[rarity];
    const cam = scene.cameras.main;
    if (fx.shake)
    {
        cam.shake(fx.shake.duration, fx.shake.intensity);
    }
    if (fx.flash)
    {
        const c = fx.flash.color;
        cam.flash(fx.flash.duration, (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
    }
}

// Expanding ring that fades out.
export function shockwave (scene: Scene, x: number, y: number, tint: number, depth: number, size = 520): void
{
    const ring = scene.add.image(x, y, FX.ring)
        .setTint(tint).setBlendMode(BlendModes.ADD).setDepth(depth).setScale(0.1).setAlpha(1);
    scene.tweens.add({
        targets: ring,
        scale: size / 256,
        alpha: 0,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
    });
}

// Text that rises and fades, e.g. "Level 2!".
export function floatText (scene: Scene, x: number, y: number, text: string, color: string = PALETTE.gold, size = 40, depth = 3000): void
{
    const t = scene.add.text(x, y, text, {
        fontFamily: 'Georgia, serif', fontStyle: 'bold', fontSize: size, color,
        stroke: '#170e10', strokeThickness: 8, align: 'center'
    }).setOrigin(0.5).setDepth(depth).setScale(0.6).setAlpha(0);

    scene.tweens.chain({
        targets: t,
        tweens: [
            { scale: 1, alpha: 1, y: y - 30, duration: 260, ease: 'Back.easeOut' },
            { y: y - 90, alpha: 0, delay: 900, duration: 500, ease: 'Sine.easeIn' }
        ],
        onComplete: () => t.destroy()
    });
}

export function vibrate (pattern: number | number[]): void
{
    try
    {
        navigator.vibrate?.(pattern);
    }
    catch
    {
        // Some browsers throw when vibration isn't allowed yet; haptics are optional.
    }
}
