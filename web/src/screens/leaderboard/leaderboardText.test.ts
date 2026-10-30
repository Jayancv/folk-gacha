import { describe, expect, it } from 'vitest';
import { medal, playersText, timeLeftText, weekLabel } from './leaderboardText';

const week44 = { id: '2026-W44', startsAt: '2026-10-26T00:00:00Z', endsAt: '2026-11-02T00:00:00Z' };
const before = (ms: number) => Date.parse(week44.endsAt) - ms;
const MIN = 60_000;

describe('leaderboard text', () =>
{
    it('labels the week Monday to Sunday in UTC', () =>
    {
        expect(weekLabel(week44, 'en-GB')).toBe('Week 44 · 26 Oct – 1 Nov');
        expect(weekLabel({ id: '2027-W01', startsAt: '2027-01-04T00:00:00Z', endsAt: '2027-01-11T00:00:00Z' }, 'en-GB')).toBe('Week 1 · 4 Jan – 10 Jan');
        // Across a year boundary.
        expect(weekLabel({ id: '2026-W53', startsAt: '2026-12-28T00:00:00Z', endsAt: '2027-01-04T00:00:00Z' }, 'en-GB')).toBe('Week 53 · 28 Dec – 3 Jan');
    });

    it('counts down to Monday 00:00 UTC, rounding up', () =>
    {
        expect(timeLeftText(week44.endsAt, before((2 * 24 * 60 + 5 * 60 + 30) * MIN))).toBe('Ends in 2d 5h');
        expect(timeLeftText(week44.endsAt, before((3 * 60 + 12) * MIN))).toBe('Ends in 3h 12m');
        expect(timeLeftText(week44.endsAt, before(12 * MIN))).toBe('Ends in 12m');
        expect(timeLeftText(week44.endsAt, before(1000))).toBe('Ends in 1m');
        expect(timeLeftText(week44.endsAt, before(0))).toMatch(/final standings/);
    });

    it('gives medals to the top 3 only', () =>
    {
        expect([1, 2, 3].map(medal).every(Boolean)).toBe(true);
        expect(medal(4)).toBeNull();
        expect(medal(0)).toBeNull();
    });

    it('counts players', () =>
    {
        expect(playersText(1)).toBe('1 player ranked');
        expect(playersText(0)).toBe('0 players ranked');
        expect(playersText(12)).toBe('12 players ranked');
    });
});
