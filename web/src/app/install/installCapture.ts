// Catches the browser's install dialog (beforeinstallprompt) from the moment the app
// starts: it fires once, early, and the game screen loads later (lazily, after sign-in).
// Started from main.tsx; React reads it through useInstallPrompt.

/** Chrome/Edge/Samsung Internet's install event (not in the TypeScript DOM types). */
export interface BeforeInstallPromptEvent extends Event
{
    prompt (): Promise<void>;
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface CapturedInstall
{
    /** The deferred install dialog, until it's used or the app is installed. */
    prompt: BeforeInstallPromptEvent | null;
    installed: boolean;
}

let state: CapturedInstall = { prompt: null, installed: false };
const listeners = new Set<() => void>();

function set (next: CapturedInstall)
{
    state = next;
    listeners.forEach(fn => fn());
}

export function startInstallCapture (): void
{
    window.addEventListener('beforeinstallprompt', e =>
    {
        e.preventDefault(); // keep the mini-infobar away; we show our own banner at a better moment
        set({ ...state, prompt: e as BeforeInstallPromptEvent });
    });
    window.addEventListener('appinstalled', () => set({ prompt: null, installed: true }));
}

/** The current state; a new object only when something changed (for useSyncExternalStore). */
export const getCapturedInstall = (): CapturedInstall => state;

export function subscribeInstall (fn: () => void): () => void
{
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** A deferred prompt can be shown only once. */
export function forgetPrompt (): void
{
    set({ ...state, prompt: null });
}
