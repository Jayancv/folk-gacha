import { useQuery } from '@tanstack/react-query';
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

/** "Your pack is ready" notifications for this device: the state to show, and on/off actions. */
export function usePushNotifications (): { state: PushState; busy: boolean; turnOn: () => void; turnOff: () => void }
{
    // The server's VAPID key; null (404) means this server doesn't send push.
    const key = useQuery({
        queryKey: ['push-key'],
        queryFn: async () => (await api.GET('/push/key')).data?.publicKey ?? null,
        staleTime: Infinity,
        retry: false
    });
    const [supported, setSupported] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>(() => ('Notification' in window ? Notification.permission : 'default'));
    const [busy, setBusy] = useState(false);

    // Find this device's subscription. If one exists, send it again: browsers can rotate it,
    // and it must belong to whoever is signed in now.
    useEffect(() =>
    {
        let cancelled = false;
        void (async () =>
        {
            const ok = await pushSupported();
            const sub = ok ? await currentSubscription() : null;
            if (cancelled)
            {
                return;
            }
            setSupported(ok);
            setSubscribed(sub !== null);
            if (sub && Notification.permission === 'granted')
            {
                void saveSubscription(sub);
            }
        })();
        return () =>
        {
            cancelled = true;
        };
    }, []);

    const turnOn = () =>
    {
        if (!key.data || busy)
        {
            return;
        }
        setBusy(true);
        enablePush(key.data)
            .then(p =>
            {
                setPermission(p);
                setSubscribed(p === 'granted');
            })
            .catch(err => console.warn('notifications: could not subscribe', err))
            .finally(() => setBusy(false));
    };

    const turnOff = () =>
    {
        setBusy(true);
        void disablePush().finally(() =>
        {
            setSubscribed(false);
            setBusy(false);
        });
    };

    const state = pushState({
        supported,
        serverEnabled: Boolean(key.data),
        permission,
        ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
        standalone: isStandalone(),
        subscribed
    });
    return { state, busy, turnOn, turnOff };
}
