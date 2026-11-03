import { describe, expect, it } from 'vitest';
import { SHINE } from './drawCard';
import { SHINE_SWEEP_MS, shineBand, shineLoop } from './shineModel';

describe('shineLoop', () =>
{
    it('sweeps once, then rests for the middle of the table wait', () =>
    {
        const loop = shineLoop('common', () => 0);
        expect(loop.duration).toBe(SHINE_SWEEP_MS + 8000);
        expect(loop.sweepEnd).toBeCloseTo(SHINE_SWEEP_MS / loop.duration);
        expect(loop.alpha).toBe(SHINE.common.alpha);
        expect(loop.delay).toBe(-0);
    });

    it('shines more often and brighter for better rarities', () =>
    {
        const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
        const loops = order.map(r => shineLoop(r));
        for (let i = 1; i < loops.length; i++)
        {
            expect(loops[i].duration).toBeLessThan(loops[i - 1].duration);
            expect(loops[i].alpha).toBeGreaterThan(loops[i - 1].alpha);
        }
    });

    it('starts somewhere in the cycle so a grid does not shine in sync', () =>
    {
        const loop = shineLoop('rare', () => 0.5);
        expect(loop.delay).toBe(-Math.round(loop.duration / 2));
    });

    it('moves the band fully off the card on both sides', () =>
    {
        // Band is 32% of the card wide; its centre travels 1.1 card widths each way.
        expect(shineLoop('epic').travelPct).toBe(344);
    });
});

describe('shineBand', () =>
{
    it('is white, gold for gold foil and a masked rainbow for holo', () =>
    {
        expect(shineBand('none')).toEqual({ background: expect.stringContaining('255,255,255,1)'), mask: null });
        expect(shineBand('gold').background).toContain('255,224,138,1)');
        const holo = shineBand('holo');
        expect(holo.background).toContain('#8cf5a2');
        expect(holo.mask).toContain('255,255,255,1)');
    });
});
