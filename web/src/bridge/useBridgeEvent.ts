import { useEffect, useLayoutEffect, useRef } from 'react';
import { EventBus } from './EventBus';
import type { BridgeEvent, BridgeEvents } from './events';

/**
 * Subscribes a React component to a bridge event for as long as it is mounted.
 * The latest `handler` is always called, so it can use fresh props and state
 * without re-subscribing on every render.
 */
export function useBridgeEvent<K extends BridgeEvent> (event: K, handler: (payload: BridgeEvents[K]) => void): void
{
    const latest = useRef(handler);
    useLayoutEffect(() =>
    {
        latest.current = handler;
    });

    useEffect(() =>
    {
        const fn = (payload: BridgeEvents[K]) => latest.current(payload);
        EventBus.on(event, fn);
        return () =>
        {
            EventBus.off(event, fn);
        };
    }, [event]);
}
