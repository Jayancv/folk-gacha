import { describe, expect, it } from 'vitest';
import { ApiRequestError, signInErrorText } from './useAuth';

describe('signInErrorText', () =>
{
    it('explains each server error in plain words', () =>
    {
        expect(signInErrorText(new ApiRequestError(401, 'invalid_token'))).toMatch(/Google sign-in failed/);
        expect(signInErrorText(new ApiRequestError(404, 'dev_login_disabled'))).toMatch(/turned off/);
        expect(signInErrorText(new ApiRequestError(400, 'bad_name', 'Use 3+ letters or digits.'))).toBe('Use 3+ letters or digits.');
        expect(signInErrorText(new ApiRequestError(500, 'internal'))).toMatch(/server is having trouble/);
    });

    it('treats anything else as a connection problem', () =>
    {
        expect(signInErrorText(new TypeError('Failed to fetch'))).toMatch(/Check your connection/);
    });
});
