import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../app/useRules';
import { helpSections, localResetTime, oddsRows, oddsText, percentText } from './helpModel';

describe('help', () =>
{
    it('shows the reset on the player\'s clock', () =>
    {
        expect(localResetTime('en-GB', 'Asia/Colombo')).toBe('05:30');
        expect(localResetTime('en-GB', 'UTC')).toBe('00:00');
    });

    it('writes the pack odds both ways', () =>
    {
        expect(percentText(70)).toBe('70%');
        expect(percentText(1.8)).toBe('1.8%');
        expect(oddsText(20)).toBe('1 in 5');
        expect(oddsText(0.2)).toBe('1 in 500');
        expect(oddsText(0)).toBe('never');
        expect(oddsText(70)).toBe('most cards');
        const rows = oddsRows(DEFAULT_RULES);
        expect(rows.map(r => r.rarity)).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary']);
        expect(rows[4]).toMatchObject({ label: 'Legendary', percent: '0.2%', odds: '1 in 500' });
    });

    it('uses the server\'s numbers', () =>
    {
        const text = (rules = DEFAULT_RULES) => helpSections(rules, '05:30').flatMap(s => s.lines).join('\n');
        expect(text()).toContain('00:00 UTC (05:30 on your clock)');
        expect(text()).toContain('at least once every 7 packs');
        expect(text()).toContain('Unopened packs are kept, up to 3 packs (15 cards)');
        expect(text()).toContain('Up to 5 cards on each side');
        expect(text()).toContain('5 offers a day; an offer expires after 48 hours');
        expect(text()).toContain('up to 2 gifts a week');
        expect(text()).not.toContain('New accounts');

        const strict = text({ ...DEFAULT_RULES, newAccountWaitDays: 7, partnerGiftsPerWeek: 0, dailyOfferLimit: 1 });
        expect(strict).toContain('New accounts can trade 7 days after signing up');
        expect(strict).toContain('1 offer a day');
        expect(strict).not.toContain('gives you both a gift');
    });

    it('has a unique id per section', () =>
    {
        const ids = helpSections(DEFAULT_RULES, '00:00').map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
