import { describe, expect, it } from 'vitest';
import { DISMISS_MS, installOffer, isIos, type InstallState } from './installPolicy';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const base: InstallState = { standalone: false, canPrompt: false, ios: false, dismissedAt: null, now: 1_000_000_000_000 };

describe('isIos', () =>
{
    it('spots iPhones, and iPads that pretend to be Macs', () =>
    {
        expect(isIos(IPHONE, 5)).toBe(true);
        expect(isIos(IPAD_AS_MAC, 5)).toBe(true);
        expect(isIos(IPAD_AS_MAC, 0)).toBe(false); // a real Mac has no touch screen
        expect(isIos(ANDROID, 5)).toBe(false);
    });
});

describe('installOffer', () =>
{
    it("uses the browser's install dialog when there is one", () =>
    {
        expect(installOffer({ ...base, canPrompt: true })).toBe('prompt');
        expect(installOffer({ ...base, canPrompt: true, ios: true })).toBe('prompt');
    });

    it('explains Add to Home Screen on iPhone and iPad', () =>
    {
        expect(installOffer({ ...base, ios: true })).toBe('ios');
    });

    it('offers nothing when the browser can\'t install, or the app is already installed', () =>
    {
        expect(installOffer(base)).toBeNull();
        expect(installOffer({ ...base, canPrompt: true, standalone: true })).toBeNull();
        expect(installOffer({ ...base, ios: true, standalone: true })).toBeNull();
    });

    it('stays quiet for 14 days after "Not now"', () =>
    {
        const s = { ...base, canPrompt: true };
        expect(installOffer({ ...s, dismissedAt: base.now - 1 })).toBeNull();
        expect(installOffer({ ...s, dismissedAt: base.now - DISMISS_MS + 1 })).toBeNull();
        expect(installOffer({ ...s, dismissedAt: base.now - DISMISS_MS })).toBe('prompt');
    });
});
