import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../layout';
import { INSPECT_SCALE } from './CardInspector';
import { CARD_H, CARD_W } from './drawCard';
import { RARITIES, RARITY_STYLE, rarityRank } from './model';
import { REVEAL_FX } from './revealFx';
import { faceTextureKey, textureScaleFor } from './textures';
import { makeCard, TEMPLATES } from '../../dev/fakePack';

describe('textureScaleFor', () =>
{
    it('rounds up to half steps so the texture is never smaller than shown', () =>
    {
        expect(textureScaleFor(1.625)).toBe(2);   // iPhone grid
        expect(textureScaleFor(1.2)).toBe(1.5);
        expect(textureScaleFor(2)).toBe(2);
    });

    it('never goes below 1 or above the memory cap', () =>
    {
        expect(textureScaleFor(0.4)).toBe(1);
        expect(textureScaleFor(20)).toBe(6);
    });

    it('gives the inspect view a sharper texture than the grid', () =>
    {
        const zoom = 1.625;
        expect(textureScaleFor(zoom * INSPECT_SCALE)).toBeGreaterThan(textureScaleFor(zoom));
    });

    it('keys face textures by card copy and scale', () =>
    {
        const card = makeCard(TEMPLATES[0]);
        expect(faceTextureKey(card, 2)).not.toBe(faceTextureKey(card, 2.5));
        expect(faceTextureKey(card, 2)).not.toBe(faceTextureKey(makeCard(TEMPLATES[0]), 2));
    });
});

describe('card size', () =>
{
    it('is 5:7 like the design preview', () =>
    {
        expect(CARD_W / CARD_H).toBeCloseTo(5 / 7, 2);
    });

    it('inspect view fits inside the safe area with room for the header', () =>
    {
        expect(CARD_W * INSPECT_SCALE).toBeLessThanOrEqual(DESIGN_WIDTH - 80 + 1e-9);
        expect(CARD_H * INSPECT_SCALE).toBeLessThanOrEqual(DESIGN_HEIGHT - 280 + 1e-9);
        expect(INSPECT_SCALE).toBeGreaterThan(2);
    });
});

describe('REVEAL_FX', () =>
{
    // Rarer cards must never feel smaller than more common ones.
    const pairs = RARITIES.slice(1).map((r, i) => [RARITIES[i], r] as const);

    it('escalates build-up, particles and pop with rarity', () =>
    {
        for (const [lower, higher] of pairs)
        {
            const a = REVEAL_FX[lower];
            const b = REVEAL_FX[higher];
            expect(b.anticipationMs, `${higher} anticipation`).toBeGreaterThanOrEqual(a.anticipationMs);
            expect(b.burst, `${higher} burst`).toBeGreaterThan(a.burst);
            expect(b.sparkles, `${higher} sparkles`).toBeGreaterThanOrEqual(a.sparkles);
            expect(b.pop, `${higher} pop`).toBeGreaterThan(a.pop);
            expect(b.tremble, `${higher} tremble`).toBeGreaterThanOrEqual(a.tremble);
        }
    });

    it('keeps commons quick: no build-up, no camera effects', () =>
    {
        expect(REVEAL_FX.common.anticipationMs).toBe(0);
        expect(REVEAL_FX.common.shake).toBeUndefined();
        expect(REVEAL_FX.common.flash).toBeUndefined();
    });

    it('saves the flash and lingering sparkles for legendaries', () =>
    {
        for (const r of RARITIES)
        {
            expect(!!REVEAL_FX[r].flash, r).toBe(r === 'legendary');
            expect(REVEAL_FX[r].linger, r).toBe(r === 'legendary');
        }
    });

    it('only glows for uncommon and above', () =>
    {
        for (const r of RARITIES)
        {
            expect(RARITY_STYLE[r].glow === null, r).toBe(rarityRank(r) === 0);
        }
    });
});
