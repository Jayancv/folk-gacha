// When to offer installing the app (no React or browser globals here, so it's testable).

/** What the install banner offers: the browser's own install dialog, or iPhone/iPad instructions. */
export type InstallOffer = 'prompt' | 'ios';

/** "Not now" hides the offer for this long. */
export const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * iPhone, iPad or iPod: no install dialog there, so the banner explains Share → Add to Home Screen.
 * iPadOS reports itself as a Mac, so a touch-screen "Mac" counts as an iPad.
 */
export function isIos (userAgent: string, maxTouchPoints: number): boolean
{
    return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export interface InstallState
{
    /** Already running as an installed app. */
    standalone: boolean;
    /** The browser handed us its install dialog (beforeinstallprompt). */
    canPrompt: boolean;
    ios: boolean;
    /** When the player last chose "Not now" (ms), if ever. */
    dismissedAt: number | null;
    now: number;
}

export function installOffer (s: InstallState): InstallOffer | null
{
    if (s.standalone || (s.dismissedAt !== null && s.now - s.dismissedAt < DISMISS_MS))
    {
        return null;
    }
    if (s.canPrompt)
    {
        return 'prompt';
    }
    return s.ios ? 'ios' : null;
}
