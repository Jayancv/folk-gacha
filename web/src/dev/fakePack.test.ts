import { describe, expect, it } from 'vitest';
import { RARITIES } from '../game/cards/model';
import { cardScore, fakeClaimPack, fakeShowcasePack } from './fakePack';

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
