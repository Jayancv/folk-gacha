import { describe, expect, it } from 'vitest';
import { mergeAction, pairGroups } from './mergeModel';

const card = (over: Partial<Parameters<typeof mergeAction>[0]> = {}) => ({
    name: 'Brightly Moonlit Gaja Calf of Kandy',
    level: 2,
    inTrade: false,
    inTournament: false,
    season: { title: 'Gaja Calf' } as Parameters<typeof mergeAction>[0]['season'],
    ...over
});

describe('pairGroups', () =>
{
    const c = (id: string, templateId: string, level: number, over = {}) => ({ id, templateId, level, inTrade: false, inTournament: false, ...over });

    it('marks cards with a partner of the same spirit and level', () =>
    {
        const groups = pairGroups([c('a', 'malu', 1), c('b', 'malu', 1), c('c', 'malu', 1), c('d', 'malu', 2), c('e', 'gaja', 1)]);
        expect([...groups]).toEqual([['a', 3], ['b', 3], ['c', 3]]);
    });

    it('leaves out locked and max-level cards', () =>
    {
        expect(pairGroups([c('a', 'malu', 1), c('b', 'malu', 1, { inTrade: true })]).size).toBe(0);
        expect(pairGroups([c('a', 'malu', 1), c('b', 'malu', 1, { inTournament: true })]).size).toBe(0);
        expect(pairGroups([c('a', 'malu', 5), c('b', 'malu', 5)]).size).toBe(0);
    });
});

describe('mergeAction', () =>
{
    it('counts the level-up matches', () =>
    {
        expect(mergeAction(card(), 1)).toEqual({ enabled: true, label: 'Merge · 1 match', hint: 'Level it up with your other level 2 Gaja Calf.' });
        expect(mergeAction(card(), 3).label).toBe('Merge · 3 matches');
        expect(mergeAction(card(), 3).hint).toBe('Level it up with one of your 3 other level 2 Gaja Calf.');
    });

    it('still opens the Board without a match (recipes stay hidden)', () =>
    {
        const a = mergeAction(card(), 0);
        expect(a.enabled).toBe(true);
        expect(a.hint).toBe('No other level 2 Gaja Calf yet. Some different spirits combine into new ones.');
        expect(mergeAction(card(), undefined)).toEqual({ enabled: true, label: 'Merge', hint: '' });
        expect(mergeAction(card({ season: undefined }), 0).hint).toContain('Brightly Moonlit Gaja Calf of Kandy');
    });

    it('explains max level', () =>
    {
        expect(mergeAction(card({ level: 5 }), 4)).toMatchObject({ enabled: true, label: 'Merge' });
    });

    it('is off for locked cards', () =>
    {
        expect(mergeAction(card({ inTrade: true }), 2).enabled).toBe(false);
        expect(mergeAction(card({ inTournament: true }), 2)).toMatchObject({ enabled: false, label: 'Merge' });
    });
});
