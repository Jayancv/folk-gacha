// When and how to offer "your pack is ready" notifications (no browser globals here).

/**
 * - hidden: this browser or server can't do push, or the app isn't ready for it
 * - install-first: iPhone/iPad only deliver push to apps added to the Home Screen
 * - blocked: the player turned notifications off for this site in the browser
 * - off / on: can be switched on / is on for this device
 */
export type PushState = 'hidden' | 'install-first' | 'blocked' | 'off' | 'on';

export interface PushFacts
{
    /** Service worker + PushManager + Notification all exist and the worker is registered. */
    supported: boolean;
    /** The server sends push (GET /push/key answered). */
    serverEnabled: boolean;
    permission: NotificationPermission;
    ios: boolean;
    standalone: boolean;
    subscribed: boolean;
}

export function pushState (f: PushFacts): PushState
{
    if (!f.serverEnabled)
    {
        return 'hidden';
    }
    // Safari on iPhone/iPad has no push at all outside a Home Screen app.
    if (f.ios && !f.standalone)
    {
        return 'install-first';
    }
    if (!f.supported)
    {
        return 'hidden';
    }
    if (f.permission === 'denied')
    {
        return 'blocked';
    }
    return f.subscribed && f.permission === 'granted' ? 'on' : 'off';
}

/** A base64url VAPID key as the bytes PushManager.subscribe wants (applicationServerKey). */
export function keyBytes (base64url: string): Uint8Array<ArrayBuffer>
{
    const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
    const raw = atob(b64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++)
    {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}
