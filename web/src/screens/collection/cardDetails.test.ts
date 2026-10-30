import { describe, expect, it } from 'vitest';
import { acquiredText, copyText, setNumberText } from './cardDetails';

describe('card details', () =>
{
    it('shows the copy number, with the limit when there is one', () =>
    {
        expect(copyText({ copyNo: 3 })).toBe('Copy #3');
        expect(copyText({ copyNo: 24, maxCopies: 25 })).toBe('Copy #24 of 25');
    });

    it('formats the set number like the card face', () =>
    {
        const season = { seasonCardId: 's1-0042', setNo: 42, setSize: 1500, title: '', subtitle: '', art: {} as never };
        expect(setNumberText({ season })).toBe('#0042 / 1500');
        expect(setNumberText({ season: undefined })).toBeNull();
    });

    it('says where the card came from, dated in UTC', () =>
    {
        // 23:30 UTC on the 30th is the 31st in Colombo; the UTC date is shown.
        expect(acquiredText({ acquiredVia: 'merge', acquiredAt: '2026-10-30T23:30:00Z' }, 'en-GB')).toBe('Made by merging · 30 Oct 2026');
        expect(acquiredText({ acquiredVia: 'pack', acquiredAt: '2026-01-05T08:00:00Z' }, 'en-GB')).toBe('From a pack · 5 Jan 2026');
    });
});
