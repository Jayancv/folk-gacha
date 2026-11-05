import { describe, expect, it } from 'vitest';
import { claimErrorText, giftButtonText, giftTitle, nextPackButtonText, nextPackText, openPackText, packLimitText, packPanelTitle } from './dailyPack';

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

describe('saved-up packs', () =>
{
    it('talks about one pack or several', () =>
    {
        expect(packPanelTitle(1)).toBe('Your daily pack is here');
        expect(openPackText(1)).toBe("Open today's pack");
        expect(packPanelTitle(3)).toBe('3 packs are waiting');
        expect(openPackText(3)).toBe('Open a pack');
        expect(nextPackButtonText(2)).toBe('Open next pack · 2 left');
    });

    it('warns only when the next pack would be lost', () =>
    {
        expect(packLimitText(2, 3)).toBeNull();
        expect(packLimitText(3, 3)).toBe("You're keeping 3 packs, the most you can: open one before 00:00 UTC or the next one is lost.");
        expect(packLimitText(1, 1)).toBeNull(); // no saving up: nothing to warn about
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

describe('trade gifts', () =>
{
    it('names who the gifts came from', () =>
    {
        const p = (...names: string[]) => names.map(partner => ({ partner }));
        expect(giftTitle(p('asha'))).toBe('Gift from asha');
        expect(giftTitle(p('asha', 'ben'))).toBe('Gifts from asha and ben');
        expect(giftTitle(p('asha', 'ben', 'cara', 'dev'))).toBe('Gifts from asha, ben and 2 more');
    });

    it('names the tournament place for prizes', () =>
    {
        const cup = { tournament: 'Daily Cup', place: 1 };
        expect(giftTitle([cup])).toBe('Prize · 1st in Daily Cup');
        expect(giftTitle([cup, cup, cup])).toBe('Prizes · 1st in Daily Cup');
        expect(giftTitle([cup, { tournament: 'Weekly Grand', place: 2 }])).toBe('Tournament prizes');
        expect(giftTitle([{ partner: 'asha' }, cup])).toBe('Gifts and prizes');
    });

    it('counts the gifts on the button, at most 5 per open', () =>
    {
        expect(giftButtonText(1)).toBe('Open your gift');
        expect(giftButtonText(3)).toBe('Open 3 gifts');
        expect(giftButtonText(8)).toBe('Open 5 gifts');
    });
});
