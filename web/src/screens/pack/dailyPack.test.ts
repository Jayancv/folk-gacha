import { describe, expect, it } from 'vitest';
import { claimErrorText, nextPackText } from './dailyPack';

const reset = '2026-10-31T00:00:00Z';
const before = (ms: number) => Date.parse(reset) - ms;

describe('nextPackText', () =>
{
    it('counts down to the 00:00 UTC reset in hours and minutes', () =>
    {
        expect(nextPackText(reset, before((5 * 60 + 12) * 60_000))).toBe('Next pack in 5h 12m');
        expect(nextPackText(reset, before(60 * 60_000))).toBe('Next pack in 1h 0m');
        expect(nextPackText(reset, before(12 * 60_000))).toBe('Next pack in 12m');
    });

    it('rounds up, so the last seconds still say 1m', () =>
    {
        expect(nextPackText(reset, before(1_000))).toBe('Next pack in 1m');
        expect(nextPackText(reset, before(60_001))).toBe('Next pack in 2m');
    });

    it('says ready once the reset has passed', () =>
    {
        expect(nextPackText(reset, before(0))).toBe('Your next pack is ready');
        expect(nextPackText(reset, before(-5_000))).toBe('Your next pack is ready');
        expect(nextPackText('not a date', 0)).toBe('Your next pack is ready');
    });
});

describe('claimErrorText', () =>
{
    it('has a message for every claim error', () =>
    {
        for (const e of ['already_claimed', 'no_season', 'signed_out', 'network'] as const)
        {
            expect(claimErrorText(e)).toMatch(/\w/);
        }
    });
});
