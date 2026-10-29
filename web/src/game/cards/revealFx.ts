import type { Rarity } from './model';

// How a reveal feels per rarity. Tune these in playtesting.
export interface RevealFx
{
    /** Build-up before the flip: card trembles and glows through its back. */
    anticipationMs: number;
    /** Tremble amplitude in design units during anticipation. */
    tremble: number;
    /** Soft particles burst on reveal. */
    burst: number;
    /** Sparkle stars burst on reveal. */
    sparkles: number;
    /** Rotating light rays behind the card. */
    rays: boolean;
    /** Keep a gentle sparkle trail around the card after reveal. */
    linger: boolean;
    /** Camera shake on reveal (Phaser intensity is a fraction of the view). */
    shake?: { duration: number; intensity: number };
    /** Full-screen flash on reveal. */
    flash?: { duration: number; color: number };
    /** Haptic pattern (Android; ignored where unsupported). */
    vibrate: number | number[];
    /** Peak scale of the pop after the flip. */
    pop: number;
}

export const REVEAL_FX: Record<Rarity, RevealFx> = {
    common: {
        anticipationMs: 0, tremble: 0, burst: 8, sparkles: 0, rays: false, linger: false,
        vibrate: 8, pop: 1.06
    },
    uncommon: {
        anticipationMs: 0, tremble: 0, burst: 16, sparkles: 4, rays: false, linger: false,
        vibrate: 15, pop: 1.1
    },
    rare: {
        anticipationMs: 420, tremble: 2, burst: 28, sparkles: 10, rays: false, linger: false,
        vibrate: [20, 40, 30], pop: 1.14
    },
    epic: {
        anticipationMs: 750, tremble: 3.5, burst: 44, sparkles: 18, rays: true, linger: false,
        shake: { duration: 180, intensity: 0.006 },
        vibrate: [30, 50, 60], pop: 1.18
    },
    legendary: {
        anticipationMs: 1300, tremble: 5, burst: 80, sparkles: 34, rays: true, linger: true,
        shake: { duration: 320, intensity: 0.012 },
        flash: { duration: 380, color: 0xffe08a },
        vibrate: [40, 60, 40, 60, 120], pop: 1.24
    }
};

export function prefersReducedMotion (): boolean
{
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
