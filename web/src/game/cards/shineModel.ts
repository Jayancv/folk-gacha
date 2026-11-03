import { SHINE } from './drawCard';
import type { CardData } from './model';

/** One sweep of the light band across a card. Shared by the table (CardShine) and React cards. */
export const SHINE_SWEEP_MS = 1100;
/** Tilt of the light band, degrees. */
export const SHINE_BAND_ANGLE = 22;
/** The band, as a fraction of the card's width and height. */
export const SHINE_BAND_W = 0.32;
export const SHINE_BAND_H = 1.6;
/** How far the band's centre travels each side of the card's centre, in card widths. */
export const SHINE_TRAVEL = 1.1;

/** A looping CSS/Web Animations version of the table's shine: one sweep, then a rest. */
export interface ShineLoop
{
    /** Whole cycle (sweep + rest), ms. */
    duration: number;
    /** Where the sweep ends in the cycle (0–1). */
    sweepEnd: number;
    /** Negative start offset, ms, so cards on one screen don't all shine at once. */
    delay: number;
    alpha: number;
    /** The band's travel each way, as a translateX percentage of its own width. */
    travelPct: number;
}

/** The loop for a card: the rest is the middle of the table's random wait for its rarity. */
export function shineLoop (rarity: CardData['rarity'], random: () => number = Math.random): ShineLoop
{
    const { alpha, every: [min, max] } = SHINE[rarity];
    const duration = SHINE_SWEEP_MS + ((min + max) / 2) * 1000;
    return {
        duration,
        sweepEnd: SHINE_SWEEP_MS / duration,
        delay: -Math.round(random() * duration),
        alpha,
        travelPct: Math.round((SHINE_TRAVEL / SHINE_BAND_W) * 100)
    };
}

const BAND_ACROSS = 'rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.25) 70%, rgba(255,255,255,0) 100%';

/**
 * CSS for the band, like the table's textures: white; gold for gold foil; for holo foil a
 * rainbow along the band, faded across it by `mask`.
 */
export function shineBand (foil: string): { background: string; mask: string | null }
{
    const across = `linear-gradient(90deg, ${BAND_ACROSS})`;
    if (foil === 'holo')
    {
        return { background: 'linear-gradient(180deg, #ff7ab6, #ffd36e, #8cf5a2, #6ed3ff, #b58cff)', mask: across };
    }
    if (foil === 'gold')
    {
        return { background: across.replace(/255,255,255/g, '255,224,138'), mask: null };
    }
    return { background: across, mask: null };
}
