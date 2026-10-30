import { describe, expect, it } from 'vitest';
import { keyBytes, pushState, type PushFacts } from './pushPolicy';

const ready: PushFacts = { supported: true, serverEnabled: true, permission: 'default', ios: false, standalone: false, subscribed: false };

describe('pushState', () =>
{
    it('offers notifications when everything is in place', () =>
    {
        expect(pushState(ready)).toBe('off');
        expect(pushState({ ...ready, permission: 'granted', subscribed: true })).toBe('on');
        // Permission granted but no subscription on this device (e.g. cleared): offer again.
        expect(pushState({ ...ready, permission: 'granted' })).toBe('off');
    });

    it('hides when the server or browser can\'t push', () =>
    {
        expect(pushState({ ...ready, serverEnabled: false })).toBe('hidden');
        expect(pushState({ ...ready, supported: false })).toBe('hidden');
    });

    it('asks iPhone users to add the app to the Home Screen first', () =>
    {
        expect(pushState({ ...ready, ios: true, supported: false })).toBe('install-first');
        expect(pushState({ ...ready, ios: true, standalone: true })).toBe('off');
    });

    it('says so when the player blocked notifications', () =>
    {
        expect(pushState({ ...ready, permission: 'denied' })).toBe('blocked');
        expect(pushState({ ...ready, permission: 'denied', subscribed: true })).toBe('blocked');
    });
});

describe('keyBytes', () =>
{
    it('decodes a base64url VAPID key', () =>
    {
        // 65-byte uncompressed P-256 key starts with 0x04.
        const key = 'BDwXfG5L7TjVU4kCpZAuwdWjQXm4S41xT_CCCoU4IS4l-jYsqtq93BXk8HXW5nMJ57hYgxDRG0pV1UkomeKgKFA';
        const bytes = keyBytes(key);
        expect(bytes.length).toBe(65);
        expect(bytes[0]).toBe(4);
        expect(keyBytes('AQID')).toEqual(new Uint8Array([1, 2, 3]));
        expect(keyBytes('-_8')).toEqual(new Uint8Array([251, 255]));
    });
});
