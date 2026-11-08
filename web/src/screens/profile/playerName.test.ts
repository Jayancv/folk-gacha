import { describe, expect, it } from 'vitest';
import { handleText, nameProblem, shownName, tidyName } from './playerName';

describe('player names', () =>
{
    it('shows the chosen name with the handle, else the username', () =>
    {
        expect(shownName({ username: 'asha', name: 'Asha the Brave' })).toBe('Asha the Brave');
        expect(handleText({ username: 'asha', name: 'Asha the Brave' })).toBe('@asha');
        expect(shownName({ username: 'asha' })).toBe('asha');
        expect(handleText({ username: 'asha' })).toBeNull();
    });

    it('tidies spaces like the server', () =>
    {
        expect(tidyName('  Asha   the  Brave ')).toBe('Asha the Brave');
    });

    it('accepts names in any language', () =>
    {
        for (const ok of ['Asha', 'Jayan V.', 'ශ්‍රී ලංකා', 'நிலா', "o'neil-2_x", 'Zoë', '', '   '])
        {
            expect(nameProblem(ok)).toBeNull();
        }
    });

    it('explains what is wrong', () =>
    {
        expect(nameProblem('a')).toBe('At least 2 characters.');
        expect(nameProblem('abcdefghijklmnopqrstu')).toBe('At most 20 characters.');
        expect(nameProblem('@asha')).toContain('no emoji or symbols');
        expect(nameProblem('asha 🐉')).toContain('no emoji or symbols');
        expect(nameProblem('12345')).toBe('Use at least one letter.');
        expect(nameProblem('\u3164\u3164')).toContain('no emoji or symbols');
        expect(nameProblem('as\u1160ha')).toContain('no emoji or symbols');
    });
});
