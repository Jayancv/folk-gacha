import { parseEvent, retryDelay, type LiveEvent } from './liveModel';

export interface LiveOptions
{
    /** A fresh ticket (POST /live/ticket); null when signed out (then it stops). Throws when unreachable. */
    getTicket: () => Promise<string | null>;
    url: (ticket: string) => string;
    onEvent: (e: LiveEvent) => void;
    /** Opened (also after a reconnect): events may have been missed, so refetch. */
    onOpen: () => void;
    onStatus: (open: boolean) => void;
}

/**
 * How long the app may stay in the background before its socket is closed. The server
 * pushes trade notifications only to players with no socket open, so a hidden tab (or a
 * phone in a pocket) must not keep one open; the grace keeps quick app switches cheap.
 */
export const HIDDEN_CLOSE_MS = 15_000;

/**
 * Keeps one live socket open while started and the page is visible: reconnects with
 * backoff when it drops, and right away when the page comes back to the foreground or
 * the network returns. A page hidden for HIDDEN_CLOSE_MS closes its socket.
 */
export class LiveConnection
{
    private socket: WebSocket | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    private attempt = 0;
    private running = false;
    private connecting = false;

    constructor (private readonly opts: LiveOptions) {}

    start (): void
    {
        if (this.running)
        {
            return;
        }
        this.running = true;
        document.addEventListener('visibilitychange', this.wake);
        window.addEventListener('online', this.wake);
        void this.connect();
    }

    stop (): void
    {
        this.running = false;
        document.removeEventListener('visibilitychange', this.wake);
        window.removeEventListener('online', this.wake);
        this.clearTimer();
        this.close();
    }

    /** Closes the socket without reconnecting (stopped, or the page went to the background). */
    private close (): void
    {
        this.clearHiddenTimer();
        const s = this.socket;
        this.socket = null;
        s?.close(1000);
        this.opts.onStatus(false);
    }

    private readonly wake = () =>
    {
        if (!this.running)
        {
            return;
        }
        if (document.visibilityState !== 'visible')
        {
            // In the background: close after a grace, so trade pushes reach the phone.
            if (!this.hiddenTimer)
            {
                this.hiddenTimer = setTimeout(() =>
                {
                    this.hiddenTimer = null;
                    if (document.visibilityState !== 'visible')
                    {
                        this.clearTimer();
                        this.close();
                    }
                }, HIDDEN_CLOSE_MS);
            }
            return;
        }
        this.clearHiddenTimer();
        if (!this.socket && !this.connecting)
        {
            this.clearTimer();
            this.attempt = 0;
            void this.connect();
        }
    };

    private async connect (): Promise<void>
    {
        if (document.visibilityState !== 'visible')
        {
            return; // reconnects when the page is visible again (wake)
        }
        this.connecting = true;
        let ticket: string | null;
        try
        {
            ticket = await this.opts.getTicket();
        }
        catch
        {
            this.connecting = false;
            this.retry();
            return;
        }
        this.connecting = false;
        if (!this.running || document.visibilityState !== 'visible')
        {
            return;
        }
        if (ticket === null)
        {
            this.stop(); // signed out: /me takes the player back to sign-in
            return;
        }

        const s = new WebSocket(this.opts.url(ticket));
        this.socket = s;
        s.onopen = () =>
        {
            this.attempt = 0;
            this.opts.onStatus(true);
            this.opts.onOpen();
        };
        s.onmessage = m =>
        {
            const e = parseEvent(m.data);
            if (e)
            {
                this.opts.onEvent(e);
            }
        };
        s.onclose = () =>
        {
            if (this.socket !== s)
            {
                return; // stopped
            }
            this.socket = null;
            this.opts.onStatus(false);
            this.retry();
        };
    }

    private retry (): void
    {
        if (!this.running)
        {
            return;
        }
        this.clearTimer();
        this.timer = setTimeout(() =>
        {
            this.timer = null;
            void this.connect();
        }, retryDelay(this.attempt++));
    }

    private clearHiddenTimer (): void
    {
        if (this.hiddenTimer)
        {
            clearTimeout(this.hiddenTimer);
            this.hiddenTimer = null;
        }
    }

    private clearTimer (): void
    {
        if (this.timer)
        {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
