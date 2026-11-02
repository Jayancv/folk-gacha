import { describe, expect, it } from 'vitest';
import { makeCard, TEMPLATES } from '../../dev/fakePack';
import { packSlots, revealHint, summarizePack, summaryText } from './packModel';

const t = (id: string) => TEMPLATES.find(t => t.templateId === id)!;

describe('summarizePack', () =>
{
    it('adds up the scores', () =>
    {
        const cards = [makeCard(t('malu')), makeCard(t('ura')), makeCard(t('gajasinghe'))];
        expect(summarizePack(cards).total).toBe(10 + 25 + 60);
    });

    it('picks the highest rarity as the best pull, even with a lower score', () =>
    {
        const highLevelCommon = makeCard(t('malu'), 5); // 10 x 2.2^4 = 234 pts
        const rare = makeCard(t('serapendiya'), 1);     // 60 pts
        expect(summarizePack([highLevelCommon, rare]).best).toBe(rare);
    });

    it('breaks rarity ties by score, then keeps the first card', () =>
    {
        const a = makeCard(t('malu'), 1);
        const b = makeCard(t('monara'), 2);
        const c = makeCard(t('gaja-calf'), 2);
        expect(summarizePack([a, b, c]).best).toBe(b);
    });

    it('refuses an empty pack', () =>
    {
        expect(() => summarizePack([])).toThrow();
    });
});

describe('pack text', () =>
{
    it('formats the summary with the rarity label', () =>
    {
        const text = summaryText([makeCard(t('malu')), makeCard(t('makara'))]);
        expect(text).toBe('Pack value 410 pts\nBest pull: Makara (Legendary)');
    });

    it('prompts before the first reveal, then counts', () =>
    {
        expect(revealHint(0, 5)).toBe('Tap or swipe across the cards to reveal');
        expect(revealHint(3, 5)).toBe('3 of 5 revealed');
    });
});

describe('packSlots', () =>
{
    const step = { x: 100, y: 200 };
    it('lays a daily pack 3 on top, 2 below', () =>
    {
        expect(packSlots(5, 0, 0, step)).toEqual([
            { x: -100, y: -100 }, { x: 0, y: -100 }, { x: 100, y: -100 },
            { x: -50, y: 100 }, { x: 50, y: 100 }
        ]);
    });
    it('centres fewer cards (trade gifts)', () =>
    {
        expect(packSlots(1, 360, 650, step)).toEqual([{ x: 360, y: 650 }]);
        expect(packSlots(2, 0, 0, step)).toEqual([{ x: -50, y: 0 }, { x: 50, y: 0 }]);
        expect(packSlots(4, 0, 0, step).map(s => s.y)).toEqual([-100, -100, 100, 100]);
    });
    it('deals at most 5', () =>
    {
        expect(packSlots(7, 0, 0, step)).toHaveLength(5);
    });
});

describe('gift summary', () =>
{
    it('names the gift instead of the pack value', () =>
    {
        const card = makeCard(t('malu'));
        expect(summaryText([card], 'Gift from asha')).toBe(`Gift from asha\n${card.name} (Common)`);
    });
});
