import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_CLOSE_MS, LiveConnection } from './liveSocket';

// Just enough of the browser for LiveConnection: a page that can be hidden, and sockets.
class FakeSocket
{
    static all: FakeSocket[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    constructor (readonly url: string) { FakeSocket.all.push(this); }
    close () { this.closed = true; this.onclose?.(); }
}

let visibility: 'visible' | 'hidden' = 'visible';
const pageListeners = new Map<string, () => void>();
const listeners = { addEventListener: (t: string, f: () => void) => pageListeners.set(t, f), removeEventListener: (t: string) => pageListeners.delete(t) };

function setVisibility (v: 'visible' | 'hidden')
{
    visibility = v;
    pageListeners.get('visibilitychange')?.();
}

function connection ()
{
    const status: boolean[] = [];
    const live = new LiveConnection({
        getTicket: async () => 'ticket',
        url: t => `wss://example.invalid/ws?ticket=${t}`,
        onEvent: () => {},
        onOpen: () => {},
        onStatus: open => status.push(open)
    });
    return { live, status };
}

describe('live socket in the background', () =>
{
    beforeEach(() =>
    {
        vi.useFakeTimers();
        FakeSocket.all = [];
        visibility = 'visible';
        pageListeners.clear();
        vi.stubGlobal('WebSocket', FakeSocket);
        vi.stubGlobal('window', listeners);
        vi.stubGlobal('document', { ...listeners, get visibilityState () { return visibility; } });
    });
    afterEach(() =>
    {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('closes a hidden page\'s socket after a grace, and reopens it when visible', async () =>
    {
        const { live, status } = connection();
        live.start();
        await vi.runOnlyPendingTimersAsync();
        expect(FakeSocket.all).toHaveLength(1);
        FakeSocket.all[0].onopen?.();

        // A quick app switch keeps the socket.
        setVisibility('hidden');
        await vi.advanceTimersByTimeAsync(HIDDEN_CLOSE_MS / 2);
        setVisibility('visible');
        await vi.advanceTimersByTimeAsync(HIDDEN_CLOSE_MS);
        expect(FakeSocket.all[0].closed).toBe(false);

        // Staying in the background closes it, and nothing reconnects while hidden.
        setVisibility('hidden');
        await vi.advanceTimersByTimeAsync(HIDDEN_CLOSE_MS + 60_000);
        expect(FakeSocket.all[0].closed).toBe(true);
        expect(FakeSocket.all).toHaveLength(1);
        expect(status[status.length - 1]).toBe(false);

        // Back in front: a new socket.
        setVisibility('visible');
        await vi.runOnlyPendingTimersAsync();
        expect(FakeSocket.all).toHaveLength(2);
        live.stop();
    });

    it('doesn\'t connect while started in the background', async () =>
    {
        visibility = 'hidden';
        const { live } = connection();
        live.start();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(FakeSocket.all).toHaveLength(0);
        setVisibility('visible');
        await vi.runOnlyPendingTimersAsync();
        expect(FakeSocket.all).toHaveLength(1);
        live.stop();
    });
});
