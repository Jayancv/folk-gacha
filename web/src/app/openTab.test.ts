import { describe, expect, it } from 'vitest';
import { tabFromUrl } from './openTab';

describe('tabFromUrl', () =>
{
    it('reads the tab a notification links to', () =>
    {
        expect(tabFromUrl('/?tab=trades')).toBe('Trades');
        expect(tabFromUrl('https://folk.example/?tab=tournaments')).toBe('Tournaments');
        expect(tabFromUrl('/')).toBeNull();
        expect(tabFromUrl('/?tab=nonsense')).toBeNull();
    });
});
