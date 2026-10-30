import { describe, expect, it } from 'vitest';
import { joinedText, MAX_SHOWCASE, pickerCountText, togglePick } from './profileModel';

describe('showcase picking', () =>
{
    it('keeps tap order as display order', () =>
    {
        let picked = togglePick([], 'c');
        picked = togglePick(picked, 'a');
        picked = togglePick(picked, 'b');
        expect(picked).toEqual(['c', 'a', 'b']);
    });

    it('removes a card tapped again, keeping the others in order', () =>
    {
        expect(togglePick(['c', 'a', 'b'], 'a')).toEqual(['c', 'b']);
    });

    it('ignores new cards once full, but still allows removing', () =>
    {
        const full = ['1', '2', '3', '4', '5'];
        expect(full.length).toBe(MAX_SHOWCASE);
        expect(togglePick(full, '6')).toEqual(full);
        expect(togglePick(full, '3')).toEqual(['1', '2', '4', '5']);
    });

    it('describes the pick', () =>
    {
        expect(pickerCountText(0)).toBe('Pick up to 5 cards');
        expect(pickerCountText(3)).toBe('3 of 5 picked');
    });
});

describe('joinedText', () =>
{
    it('shows the month and year in UTC', () =>
    {
        expect(joinedText('2026-10-30T12:00:00Z', 'en-GB')).toBe('Joined Oct 2026');
        // 23:30 UTC on 31 Dec is still December in UTC.
        expect(joinedText('2026-12-31T23:30:00Z', 'en-GB')).toBe('Joined Dec 2026');
    });
});
