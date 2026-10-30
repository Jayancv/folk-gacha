import { describe, expect, it } from 'vitest';
import {
    activeFilterCount,
    clearFilters,
    countText,
    emptyText,
    NO_FILTERS,
    toggleElement,
    toggleLevel,
    toggleRarity,
    toQuery
} from './filters';

describe('collection filters', () =>
{
    it('toggles chips and keeps a fixed order', () =>
    {
        let f = toggleRarity(NO_FILTERS, 'legendary');
        f = toggleRarity(f, 'rare');
        expect(f.rarities).toEqual(['rare', 'legendary']);
        expect(toggleRarity(f, 'rare').rarities).toEqual(['legendary']);
        expect(toggleElement(toggleElement(NO_FILTERS, 'wind'), 'earth').elements).toEqual(['earth', 'wind']);
    });

    it('selects one level; tapping it again clears it', () =>
    {
        const f = toggleLevel(NO_FILTERS, 3);
        expect(f.level).toBe(3);
        expect(toggleLevel(f, 4).level).toBe(4);
        expect(toggleLevel(f, 3).level).toBeNull();
    });

    it('counts and clears filters, keeping the sort', () =>
    {
        const f = { ...toggleLevel(toggleRarity(toggleRarity(NO_FILTERS, 'epic'), 'rare'), 2), sort: 'score' as const };
        expect(activeFilterCount(f)).toBe(3);
        expect(activeFilterCount({ ...NO_FILTERS, sort: 'score' })).toBe(0);
        expect(clearFilters(f)).toEqual({ ...NO_FILTERS, sort: 'score' });
    });

    it('builds the GET /cards query, leaving out unset filters', () =>
    {
        expect(toQuery(NO_FILTERS)).toEqual({ limit: 60, offset: 0 });
        const f = { rarities: ['rare' as const], elements: ['fire' as const, 'water' as const], level: 2, sort: 'number' as const };
        expect(toQuery(f, 120, 30)).toEqual({ rarity: ['rare'], element: ['fire', 'water'], level: 2, sort: 'number', limit: 30, offset: 120 });
    });

    it('describes counts and empty states', () =>
    {
        expect(countText(1, NO_FILTERS)).toBe('1 card');
        expect(countText(37, NO_FILTERS)).toBe('37 cards');
        expect(countText(4, toggleRarity(NO_FILTERS, 'rare'))).toBe('4 cards match');
        expect(emptyText(NO_FILTERS)).toMatch(/daily pack/);
        expect(emptyText(toggleLevel(NO_FILTERS, 5))).toMatch(/match/);
    });
});
