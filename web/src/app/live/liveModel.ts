// Live events without React or sockets: where to connect, how long to wait before
// reconnecting, and what each event means for the player. The server sends only
// what changed; the app refetches what it shows.

/** A live event from GET /ws (see api/paths/live/ticket.yaml). */
export interface LiveEvent
{
    type: string;
    tradeId?: string;
    /** The other player's username. */
    by?: string;
}

/** A message from the socket, or null if it isn't an event. */
export function parseEvent (data: unknown): LiveEvent | null
{
    if (typeof data !== 'string')
    {
        return null;
    }
    try
    {
        const e: unknown = JSON.parse(data);
        if (typeof e !== 'object' || e === null || typeof (e as LiveEvent).type !== 'string')
        {
            return null;
        }
        const { type, tradeId, by } = e as LiveEvent;
        return { type, tradeId: typeof tradeId === 'string' ? tradeId : undefined, by: typeof by === 'string' ? by : undefined };
    }
    catch
    {
        return null;
    }
}

/**
 * The socket URL for a ticket. `wsUrl` (VITE_WS_URL) wins: in production the socket
 * goes straight to the API server, since Netlify's /api proxy doesn't carry WebSockets.
 * Otherwise it is next to the API: an absolute VITE_API_URL, or the same origin's /api
 * (the dev server proxies it).
 */
export function socketUrl (ticket: string, env: { wsUrl?: string; apiUrl?: string }, page: { protocol: string; host: string }): string
{
    const q = `?ticket=${encodeURIComponent(ticket)}`;
    if (env.wsUrl)
    {
        return env.wsUrl + q;
    }
    const api = env.apiUrl ?? '/api';
    if (/^https?:\/\//.test(api))
    {
        return api.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws' + q;
    }
    const scheme = page.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${page.host}${api.replace(/\/$/, '')}/ws${q}`;
}

/** Wait before reconnect attempt `n` (0 = first retry): 1 s doubling to 30 s, with jitter so phones don't all come back at once. */
export function retryDelay (n: number, rand: () => number = Math.random): number
{
    const base = Math.min(30_000, 1_000 * 2 ** n);
    return Math.round(base * (0.75 + rand() * 0.5));
}

/** True for events that change trades (and with them cards and profiles). */
export function isTradeEvent (e: LiveEvent): boolean
{
    return e.type.startsWith('trade.');
}

/** A short notice for the player, or null for events not worth interrupting for. */
export function eventNotice (e: LiveEvent): string | null
{
    const who = e.by ?? 'A player';
    switch (e.type)
    {
        case 'trade.received':
            return `${who} sent you a trade offer`;
        case 'trade.accepted':
            return `${who} accepted your trade`;
        case 'trade.declined':
            return `${who} declined your trade`;
        case 'trade.failed':
            return 'A trade failed: a card was no longer available';
        default:
            return null; // cancelled and expired offers just disappear from the inbox
    }
}
