import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { isIos } from '../install/installPolicy';
import { currentSubscription, disablePush, enablePush, pushSupported, saveSubscription } from './pushDevice';
import { pushState, type PushState } from './pushPolicy';

function isStandalone (): boolean
{
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;
}

interface DeviceFacts
{
    supported: boolean;
    subscribed: boolean;
    permission: NotificationPermission;
}

const DEVICE_KEY = ['push-device'];

/** The endpoint last sent to the server in this page's life, so a refetch on focus doesn't POST every time. */
let savedEndpoint: string | null = null;

async function readDevice (): Promise<DeviceFacts>
{
    const supported = await pushSupported();
    const sub = supported ? await currentSubscription() : null;
    const permission: NotificationPermission = 'Notification' in window ? Notification.permission : 'default';
    // If a subscription exists, send it again: browsers can rotate it, it must belong to whoever
    // is signed in now, and it may have been made in the browser tab rather than the installed app.
    if (sub && permission === 'granted' && sub.endpoint !== savedEndpoint)
    {
        savedEndpoint = sub.endpoint;
        void saveSubscription(sub).then(ok =>
        {
            if (!ok)
            {
                savedEndpoint = null;
            }
        });
    }
    return { supported, subscribed: sub !== null, permission };
}

/**
 * "Your pack is ready" notifications for this device: the state to show, and on/off actions.
 * The device facts are one shared query, so every place showing them agrees, and they are read
 * again when the app comes back to the front: the browser tab and the installed app share one
 * subscription, so turning it on in one must show in the other.
 */
export function usePushNotifications (): { state: PushState; busy: boolean; turnOn: () => void; turnOff: () => void }
{
    const qc = useQueryClient();
    // The server's VAPID key; null (404) means this server doesn't send push.
    const key = useQuery({
        queryKey: ['push-key'],
        queryFn: async () => (await api.GET('/push/key')).data?.publicKey ?? null,
        staleTime: Infinity,
        retry: false
    });
    const device = useQuery({
        queryKey: DEVICE_KEY,
        queryFn: readDevice,
        staleTime: 0,
        refetchOnWindowFocus: 'always',
        retry: false
    });
    const [busy, setBusy] = useState(false);

    // The player can allow or block notifications in the browser's site settings while the app is open.
    useEffect(() =>
    {
        let status: PermissionStatus | null = null;
        const recheck = () => void qc.invalidateQueries({ queryKey: DEVICE_KEY });
        navigator.permissions?.query({ name: 'notifications' })
            .then(s =>
            {
                status = s;
                s.addEventListener('change', recheck);
            })
            .catch(() => undefined);
        return () => status?.removeEventListener('change', recheck);
    }, [qc]);

    const setDevice = (patch: Partial<DeviceFacts>) =>
        qc.setQueryData<DeviceFacts>(DEVICE_KEY, d => (d ? { ...d, ...patch } : d));

    const turnOn = () =>
    {
        if (!key.data || busy)
        {
            return;
        }
        setBusy(true);
        enablePush(key.data)
            .then(p => setDevice({ permission: p, subscribed: p === 'granted' }))
            .catch(err => console.warn('notifications: could not subscribe', err))
            .finally(() =>
            {
                setBusy(false);
                void qc.invalidateQueries({ queryKey: DEVICE_KEY });
            });
    };

    const turnOff = () =>
    {
        setBusy(true);
        void disablePush().finally(() =>
        {
            savedEndpoint = null;
            setDevice({ subscribed: false });
            setBusy(false);
            void qc.invalidateQueries({ queryKey: DEVICE_KEY });
        });
    };

    const facts = device.data ?? { supported: false, subscribed: false, permission: 'default' as NotificationPermission };
    const state = pushState({
        ...facts,
        serverEnabled: Boolean(key.data),
        ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
        standalone: isStandalone()
    });
    return { state, busy, turnOn, turnOff };
}
