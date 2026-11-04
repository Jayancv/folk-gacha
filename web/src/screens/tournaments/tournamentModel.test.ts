import { describe, expect, it } from 'vitest';
import type { OwnedCard } from '../../api/cards';
import {
    entriesText, formatRule, pointsByCard, prizeFor, prizesText, utcTimeText, groupTournaments, lineupCountText, multiplierText, openToEnterCount, pickBlock, placeText,
    statusLine, tournamentErrorText, untilText, type Tournament, type TournamentFormat
} from './tournamentModel';

const NOW = Date.parse('2026-11-04T10:00:00Z');

function tournament (over: Partial<Tournament> = {}): Tournament
{
    return {
        id: 'daily-2026-11-04', series: 'daily', name: 'Daily Cup', status: 'open',
        format: { id: 'power', kind: 'power', name: 'Power', slots: 3, onePerSpirit: false },
        opensAt: '2026-11-04T00:00:00Z', closesAt: '2026-11-04T20:00:00Z', endsAt: '2026-11-05T00:00:00Z',
        entries: 0, entered: false, prizes: [3, 2, 1],
        ...over
    };
}

function card (over: Partial<OwnedCard> = {}): OwnedCard
{
    return {
        id: 'c1', templateId: 'gaja-calf', name: 'Gaja Calf', nameSi: '', element: 'earth', rarity: 'common', level: 1, score: 10,
        lore: '', copyNo: 1, acquiredVia: 'pack', acquiredAt: '2026-11-01T00:00:00Z', inTrade: false, inTournament: false,
        ...over
    } as OwnedCard;
}

describe('groupTournaments', () =>
{
    it('splits running, coming up and finished', () =>
    {
        const list = [tournament({ id: 'a' }), tournament({ id: 'b', status: 'locked' }), tournament({ id: 'c', status: 'finished' })];
        const g = groupTournaments(list, [tournament({ id: 'd', status: 'upcoming' })]);
        expect(g.now.map(t => t.id)).toEqual(['a', 'b']);
        expect(g.next.map(t => t.id)).toEqual(['d']);
        expect(g.past.map(t => t.id)).toEqual(['c']);
    });

    it('counts open tournaments you have not entered', () =>
    {
        expect(openToEnterCount([tournament(), tournament({ entered: true }), tournament({ status: 'locked' })])).toBe(1);
    });
});

describe('formatRule', () =>
{
    const f = (over: Partial<TournamentFormat>): TournamentFormat => ({ id: 'x', kind: 'power', name: 'X', slots: 3, onePerSpirit: false, ...over });

    it('explains every format in one line', () =>
    {
        expect(formatRule(f({ slots: 5 }))).toBe('Up to 5 cards · Highest total score wins');
        expect(formatRule(f({ kind: 'element-trial', slots: 4, elementMultiplier: 2 }), 'water')).toBe('Up to 4 cards · Water cards score ×2');
        expect(formatRule(f({ kind: 'rarity-cap', maxRarity: 'uncommon', allowAbove: 0 }))).toBe('Up to 3 cards · Uncommon or lower only');
        expect(formatRule(f({ kind: 'rarity-cap', maxRarity: 'rare', allowAbove: 1 }))).toBe('Up to 3 cards · Rare or lower only, plus 1 better card');
        expect(formatRule(f({ kind: 'underdog' }))).toContain('levelled-up Common');
        expect(formatRule(f({ kind: 'harmony', slots: 5, harmonyBonusPercent: 10, onePerSpirit: true })))
            .toBe('Up to 5 cards · +10% for each element after the first, one per spirit');
    });
});

describe('times', () =>
{
    it('counts down in the largest whole unit', () =>
    {
        expect(untilText('2026-11-04T10:00:30Z', NOW)).toBe('now');
        expect(untilText('2026-11-04T10:12:00Z', NOW)).toBe('in 12 min');
        expect(untilText('2026-11-04T20:00:00Z', NOW)).toBe('in 10 h');
        expect(untilText('2026-11-07T10:00:00Z', NOW)).toBe('in 3 d');
    });

    it('says where each status stands', () =>
    {
        expect(statusLine(tournament({ status: 'upcoming', opensAt: '2026-11-05T00:00:00Z' }), NOW)).toBe('Opens in 14 h');
        expect(statusLine(tournament(), NOW)).toBe('Entries close in 10 h');
        expect(statusLine(tournament({ status: 'locked' }), NOW)).toBe('Results are in · cards free in 14 h');
        expect(statusLine(tournament({ status: 'finished' }), NOW, 'en-GB')).toBe('Finished 5 Nov');
    });
});

describe('text', () =>
{
    it('formats counts, multipliers and places', () =>
    {
        expect(entriesText(1)).toBe('1 player');
        expect(entriesText(12)).toBe('12 players');
        expect(multiplierText(1)).toBe('');
        expect(multiplierText(2)).toBe('×2');
        expect(multiplierText(0.4)).toBe('×0.4');
        expect(multiplierText(10 / 60)).toBe('×0.17');
        expect(lineupCountText(0, 4)).toBe('Pick 1 to 4 cards');
        expect(lineupCountText(2, 4)).toBe('2 of up to 4 picked');
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(placeText)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
    });

    it('prefers the server message for errors', () =>
    {
        expect(tournamentErrorText('cooldown', 'Server says no.')).toBe('Server says no.');
        expect(tournamentErrorText('closed')).toContain('closed');
        expect(tournamentErrorText('whatever')).toBe('Something went wrong. Try again.');
    });
});

describe('pickBlock', () =>
{
    const t = tournament();

    it('allows free cards and blocks locked ones', () =>
    {
        expect(pickBlock(card(), t, [], [])).toBeNull();
        expect(pickBlock(card({ inTrade: true }), t, [], [])).toBe('In a trade');
        expect(pickBlock(card({ inTournament: true }), t, [], [])).toBe('In an event');
        // Locked in this tournament's own saved entry: still yours to keep or swap.
        expect(pickBlock(card({ inTournament: true }), t, [], ['c1'])).toBeNull();
    });

    it('blocks cards traded after the tournament opened', () =>
    {
        expect(pickBlock(card({ acquiredVia: 'trade', acquiredAt: '2026-11-04T08:00:00Z' }), t, [], [])).toBe('Traded too late');
        expect(pickBlock(card({ acquiredVia: 'gift', acquiredAt: '2026-11-04T08:00:00Z' }), t, [], [])).toBe('Traded too late');
        expect(pickBlock(card({ acquiredVia: 'trade', acquiredAt: '2026-11-03T08:00:00Z' }), t, [], [])).toBeNull();
        expect(pickBlock(card({ acquiredVia: 'pack', acquiredAt: '2026-11-04T08:00:00Z' }), t, [], [])).toBeNull();
    });

    it('keeps one card per spirit when the format asks', () =>
    {
        const harmony = tournament({ format: { id: 'h', kind: 'harmony', name: 'Harmony', slots: 5, onePerSpirit: true, harmonyBonusPercent: 10 } });
        const picked = [card({ id: 'p1' })];
        expect(pickBlock(card({ id: 'c2' }), harmony, picked, [])).toBe('Same spirit');
        expect(pickBlock(card({ id: 'c2', templateId: 'malu' }), harmony, picked, [])).toBeNull();
        expect(pickBlock(card({ id: 'c2' }), t, picked, [])).toBeNull();
    });

    it('applies the rarity cap, counting the cards allowed above it', () =>
    {
        const capped = tournament({ format: { id: 'r', kind: 'rarity-cap', name: 'Humble', slots: 3, onePerSpirit: false, maxRarity: 'uncommon', allowAbove: 1 } });
        const rare = card({ id: 'r1', rarity: 'rare' });
        expect(pickBlock(card({ rarity: 'uncommon' }), capped, [], [])).toBeNull();
        expect(pickBlock(rare, capped, [], [])).toBeNull();
        expect(pickBlock(card({ id: 'r2', rarity: 'epic' }), capped, [rare], [])).toBe('Too rare');
        // A picked card can always be tapped out again.
        expect(pickBlock(rare, capped, [rare], [])).toBeNull();
    });
});

describe('prizes', () =>
{
    it('lists the prize cards by place', () =>
    {
        expect(prizesText([3, 2, 1])).toBe('1st 3 cards · 2nd 2 · 3rd 1');
        expect(prizesText([1])).toBe('1st 1 card');
        expect(prizesText([])).toBeNull();
    });

    it('gives the top places their cards', () =>
    {
        expect([undefined, 0, 1, 2, 3, 4].map(r => prizeFor([3, 2, 1], r))).toEqual([0, 0, 3, 2, 1, 0]);
    });
});

describe('utcTimeText and pointsByCard', () =>
{
    it('shows times in UTC', () =>
    {
        expect(utcTimeText('2026-11-04T20:00:00Z', 'en-GB')).toBe('Wed 20:00 UTC');
    });

    it('maps the breakdown by card', () =>
    {
        const m = pointsByCard({ cards: [{ cardId: 'a', multiplier: 2, points: 40 }], bonusPercent: 0, bonus: 0, total: 40 });
        expect(m.get('a')).toEqual({ points: 40, multiplier: 2 });
        expect(pointsByCard(undefined).size).toBe(0);
    });
});
