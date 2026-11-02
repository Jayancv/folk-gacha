import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { refreshAfterTrade, TRADES_KEY } from '../../screens/trades/useTrades';
import { eventNotice, isTradeEvent, socketUrl } from './liveModel';
import { LiveConnection } from './liveSocket';
import { setLiveConnected } from './liveStatus';

async function getTicket (): Promise<string | null>
{
    const { data, response } = await api.POST('/live/ticket');
    if (response.status === 401)
    {
        return null;
    }
    if (!data)
    {
        throw new Error(`live ticket: ${response.status}`);
    }
    return data.ticket;
}

/**
 * Live events while the game is open (GET /ws): trade changes refresh the inbox,
 * cards and profiles at once, and `onNotice` gets a line worth showing the player.
 */
export function useLive (onNotice: (text: string) => void): void
{
    const qc = useQueryClient();
    const notice = useRef(onNotice);
    useEffect(() =>
    {
        notice.current = onNotice;
    });

    useEffect(() =>
    {
        const env = { wsUrl: import.meta.env.VITE_WS_URL as string | undefined, apiUrl: import.meta.env.VITE_API_URL as string | undefined };
        const conn = new LiveConnection({
            getTicket,
            url: ticket => socketUrl(ticket, env, window.location),
            onEvent: e =>
            {
                if (isTradeEvent(e))
                {
                    refreshAfterTrade(qc);
                }
                const text = eventNotice(e);
                if (text)
                {
                    notice.current(text);
                }
            },
            onOpen: () => void qc.invalidateQueries({ queryKey: TRADES_KEY }),
            onStatus: setLiveConnected
        });
        conn.start();
        return () => conn.stop();
    }, [qc]);
}
