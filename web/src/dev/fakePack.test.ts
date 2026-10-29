import { describe, expect, it } from 'vitest';
import { RARITIES, type Rarity } from '../game/cards/model';
import {
    cardScore,
    fakeClaimPack,
    fakeShowcasePack,
    levelScore,
    makeCard,
    seasonSource,
    TEMPLATES,
    weightedIndex
} from './fakePack';
import { buildCatalog, type CatalogRow } from './seasonCatalog';

describe('cardScore', () =>
{
    it('follows base score x 2.2 per level, rounded', () =>
    {
        expect(cardScore('common', 1)).toBe(10);
        expect(cardScore('common', 2)).toBe(22);
        expect(cardScore('rare', 3)).toBe(290);
        expect(cardScore('legendary', 5)).toBe(9370);
    });
});

describe('fake packs', () =>
{
    it('deals 5 level-1 cards with unique ids', () =>
    {
        const pack = fakeClaimPack();
        expect(pack).toHaveLength(5);
        expect(new Set(pack.map(c => c.id)).size).toBe(5);
        expect(pack.every(c => c.level === 1 && c.score === cardScore(c.rarity, 1))).toBe(true);
    });

    it('rolls by rarity bands', () =>
    {
        expect(fakeClaimPack(() => 0).every(c => c.rarity === 'common')).toBe(true);
        expect(fakeClaimPack(() => 0.999).every(c => c.rarity === 'legendary')).toBe(true);
    });

    it('showcase has one of every rarity', () =>
    {
        expect(fakeShowcasePack().map(c => c.rarity).sort()).toEqual([...RARITIES].sort());
    });
});

describe('weightedIndex', () =>
{
    it('picks proportionally to weight and never picks zero weights', () =>
    {
        expect(weightedIndex([1, 0, 3], () => 0)).toBe(0);
        expect(weightedIndex([1, 0, 3], () => 0.24)).toBe(0);
        expect(weightedIndex([1, 0, 3], () => 0.26)).toBe(2);
        expect(weightedIndex([1, 0, 3], () => 0.9999)).toBe(2);
        expect(weightedIndex([0, 5, 0], () => 0.9999)).toBe(1);
    });

    it('returns -1 when nothing can be picked', () =>
    {
        expect(weightedIndex([], () => 0.5)).toBe(-1);
        expect(weightedIndex([0, 0], () => 0.5)).toBe(-1);
    });
});

describe('seasonSource', () =>
{
    // A tiny catalog: two commons, one legendary limited to 1 copy.
    const spirits = [
        { id: 'malu', name: 'Malu Sprite', nameSi: 'මාළු', element: 'water', rarity: 'common', lore: 'Ponds.' },
        { id: 'makara', name: 'Makara', nameSi: 'මකර', element: 'water', rarity: 'legendary', lore: 'Thorana.' }
    ];
    const cfg = {
        spirits,
        palettes: [{ id: 'jade', name: 'Jade', colors: ['#1f6f55', '#bfe8d6'], weight: 1 }],
        stamps: [{ id: 'none', name: '', weight: 1, scoreMult: 1 }]
    };
    const row = (n: number, template: string, rarity: Rarity, dropWeight: number, maxCopies: number | null, score: number): CatalogRow => ({
        id: `s1-000${n}`, setNo: n, template, rarity, element: 'water',
        name: `Misty ${template}`, title: template, epithet: 'Misty', nameSi: '',
        traits: { prefix: 'misty', intensity: 1, adverb: '', suffix: 'none', pattern: 'liyawala', palette: 'jade', stamp: 'none', foil: 'none' },
        score, dropWeight, maxCopies, artSeed: n
    });
    const catalog = () => buildCatalog({
        id: 's1',
        cardCount: 3,
        cards: [row(1, 'malu', 'common', 1, null, 11), row(2, 'malu', 'common', 3, null, 12), row(3, 'makara', 'legendary', 1, 1, 480)]
    }, cfg);

    it('deals season cards with their catalog look and level-1 score', () =>
    {
        const pack = seasonSource(catalog()).pack(() => 0.1);
        expect(pack).toHaveLength(5);
        expect(pack.every(c => c.season?.setSize === 3 && c.season.art.palette[0] === '#1f6f55')).toBe(true);
        expect(new Set(pack.map(c => c.id)).size).toBe(5);
    });

    it('picks within a rarity by dropWeight', () =>
    {
        const source = seasonSource(catalog());
        // rand 0.1 → common band; within commons, weights 1:3 → 0.1 * 4 = 0.4 < 1 picks #1, 0.5 * 4 = 2 picks #2.
        expect(source.create('malu', () => 0.1).season?.setNo).toBe(1);
        expect(source.create('malu', () => 0.5).season?.setNo).toBe(2);
    });

    it('stops minting a card at maxCopies and falls back to a more common rarity', () =>
    {
        const source = seasonSource(catalog());
        const first = source.showcase(() => 0.999).find(c => c.rarity === 'legendary');
        expect(first?.season?.seasonCardId).toBe('s1-0003');

        // The only legendary is used up: a legendary roll now gives the next rarity that has cards.
        const again = source.pack(() => 0.9999);
        expect(again.every(c => c.rarity === 'common')).toBe(true);
        expect(() => source.create('makara')).toThrow(/no catalog card left/);
    });

    it('levels up the same season card and multiplies its own score', () =>
    {
        const source = seasonSource(catalog());
        const card = source.create('malu', () => 0.5);
        const up = source.levelUp(card);
        expect(up.id).not.toBe(card.id);
        expect(up.level).toBe(2);
        expect(up.season?.seasonCardId).toBe(card.season?.seasonCardId);
        expect(up.score).toBe(levelScore(12, 2));
        expect(source.levelUp(up).score).toBe(levelScore(12, 3));
    });

    it('levels up plain template cards too', () =>
    {
        const card = makeCard(TEMPLATES[0]);
        const up = seasonSource(catalog()).levelUp(card);
        expect(up).toMatchObject({ templateId: card.templateId, level: 2 });
        expect(up.season).toBeUndefined();
    });
});
