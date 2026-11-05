import { describe, expect, it } from 'vitest';
import { CARDS_VIEW_KEY, navOf, readCardsView, saveCardsView } from './cardsView';

describe('cards view', () =>
{
    it('lights the Cards button for both views', () =>
    {
        expect(navOf('MergeBoard')).toBe('Cards');
        expect(navOf('Collection')).toBe('Cards');
        expect(navOf('PackOpen')).toBe('PackOpen');
        expect(navOf('Tournaments')).toBe('Tournaments');
    });

    it('remembers the view, starting on the Board', () =>
    {
        const data = new Map<string, string>();
        const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
        expect(readCardsView(storage)).toBe('MergeBoard');
        saveCardsView(storage, 'Collection');
        expect(data.get(CARDS_VIEW_KEY)).toBe('Collection');
        expect(readCardsView(storage)).toBe('Collection');
        data.set(CARDS_VIEW_KEY, 'nonsense');
        expect(readCardsView(storage)).toBe('MergeBoard');
    });

    it('works without storage', () =>
    {
        const fail = () =>
        {
            throw new Error('blocked');
        };
        const broken = { getItem: fail, setItem: fail };
        expect(readCardsView(broken)).toBe('MergeBoard');
        expect(() => saveCardsView(broken, 'Collection')).not.toThrow();
        expect(readCardsView(null)).toBe('MergeBoard');
    });
});
