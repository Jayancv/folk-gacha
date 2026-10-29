import { describe, expect, it } from 'vitest';
import { ellipsize, wrap, type TextMeasurer } from './textLayout';

// Every character is 10 units wide.
const mono: TextMeasurer = { measureText: (text: string) => ({ width: [...text].length * 10 }) };

describe('ellipsize', () =>
{
    it('leaves text that fits alone', () =>
    {
        expect(ellipsize(mono, 'Makara', 60)).toBe('Makara');
    });

    it('shortens text that is too wide and adds an ellipsis', () =>
    {
        const out = ellipsize(mono, 'Gurulu Raksha', 80);
        expect(out).toBe('Gurulu…');
        expect(mono.measureText(out).width).toBeLessThanOrEqual(80);
    });

    it('does not leave a space before the ellipsis', () =>
    {
        expect(ellipsize(mono, 'Naga Raksha', 60)).toBe('Naga…');
    });
});

describe('wrap', () =>
{
    it('keeps short text on one line', () =>
    {
        expect(wrap(mono, 'Guards the gate', 200, 2)).toEqual(['Guards the gate']);
    });

    it('breaks between words', () =>
    {
        expect(wrap(mono, 'aaa bbb ccc', 70, 2)).toEqual(['aaa bbb', 'ccc']);
    });

    it('stops at maxLines and ellipsizes the rest', () =>
    {
        const lines = wrap(mono, 'aaa bbb ccc ddd eee fff', 70, 2);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe('aaa bbb');
        expect(lines[1].endsWith('…')).toBe(true);
        expect(mono.measureText(lines[1]).width).toBeLessThanOrEqual(70);
    });

    it('cuts a single word that is wider than the line', () =>
    {
        const lines = wrap(mono, 'Supercalifragilistic', 80, 2);
        expect(lines).toEqual(['Superca…']);
    });

    it('ignores extra whitespace and handles empty text', () =>
    {
        expect(wrap(mono, '  aaa   bbb ', 200, 2)).toEqual(['aaa bbb']);
        expect(wrap(mono, '', 200, 2)).toEqual([]);
    });

    it('never returns a line wider than the limit', () =>
    {
        const lore = 'Elephant front, lion feet, boar ear, fish body. Guardian of the thorana.';
        for (const line of wrap(mono, lore, 150, 2))
        {
            expect(mono.measureText(line).width).toBeLessThanOrEqual(150);
        }
    });
});
