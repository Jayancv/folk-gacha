import { describe, expect, it } from 'vitest';
import { claimError, mergeFailure } from './game';

describe('claimError', () =>
{
    it('maps the claim endpoint errors', () =>
    {
        expect(claimError(409, 'already_claimed')).toBe('already_claimed');
        expect(claimError(503, 'no_season')).toBe('no_season');
        expect(claimError(401, 'not_signed_in')).toBe('signed_out');
    });

    it('treats anything unexpected as a network problem (retryable)', () =>
    {
        expect(claimError(500, 'internal')).toBe('network');
        expect(claimError(503, 'unavailable')).toBe('network');
        expect(claimError(409, 'something_else')).toBe('network');
    });
});

describe('mergeFailure', () =>
{
    it('maps the merge endpoint errors to board failures', () =>
    {
        expect(mergeFailure(404, 'not_owned')).toBe('not_owned');
        expect(mergeFailure(409, 'no_recipe')).toBe('no_recipe');
        expect(mergeFailure(409, 'max_level')).toBe('max_level');
        expect(mergeFailure(409, 'sold_out')).toBe('sold_out');
        expect(mergeFailure(400, 'same_card')).toBe('no_recipe');
    });

    it('treats unknown conflicts as no merge, and everything else as network', () =>
    {
        expect(mergeFailure(409, 'surprise')).toBe('no_recipe');
        expect(mergeFailure(401, 'not_signed_in')).toBe('network');
        expect(mergeFailure(500, 'internal')).toBe('network');
        expect(mergeFailure(0, undefined)).toBe('network');
    });
});
