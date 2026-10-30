// This browser's push subscription: create, look up, remove, and keep the server in sync.
// Plain functions (no React), so sign-out can use them too.

import { api } from '../../api/client';
import { keyBytes } from './pushPolicy';

/** The registered service worker, or null (no worker: dev mode, or an unsupported browser). */
async function registration (): Promise<ServiceWorkerRegistration | null>
{
    // getRegistration, not `ready`: `ready` never settles when there is no worker.
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    {
        return null;
    }
    return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushSupported (): Promise<boolean>
{
    return (await registration()) !== null;
}

export async function currentSubscription (): Promise<PushSubscription | null>
{
    const reg = await registration();
    return reg ? reg.pushManager.getSubscription() : null;
}

/** Tells the server about this subscription, for the signed-in player. */
export async function saveSubscription (sub: PushSubscription): Promise<boolean>
{
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    {
        return false;
    }
    const { response } = await api.POST('/push/subscriptions', {
        body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
    });
    return response.ok;
}

/** Asks for permission (must run from a tap) and subscribes this device. Returns the resulting permission. */
export async function enablePush (publicKey: string): Promise<NotificationPermission>
{
    const reg = await registration();
    if (!reg)
    {
        return 'default';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted')
    {
        return permission;
    }
    const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    if (!await saveSubscription(sub))
    {
        await sub.unsubscribe();
        throw new Error('push: the server refused the subscription');
    }
    return permission;
}

/**
 * Stops notifications on this device: removes it on the server (while still signed in)
 * and in the browser. Best effort; used by "Turn off" and by sign-out.
 */
export async function disablePush (): Promise<void>
{
    const sub = await currentSubscription().catch(() => null);
    if (!sub)
    {
        return;
    }
    await api.DELETE('/push/subscriptions', { body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
}
