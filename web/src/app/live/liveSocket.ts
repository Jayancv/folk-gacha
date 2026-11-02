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
 * Keeps one live socket open while started: reconnects with backoff when it drops,
 * and right away when the page comes back to the foreground or the network returns
 * (phones close the sockets of apps in the background).
 */
export class LiveConnection
{
    private socket: WebSocket | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
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
        const s = this.socket;
        this.socket = null;
        s?.close(1000);
        this.opts.onStatus(false);
    }

    private readonly wake = () =>
    {
        if (this.running && !this.socket && !this.connecting && document.visibilityState === 'visible')
        {
            this.clearTimer();
            this.attempt = 0;
            void this.connect();
        }
    };

    private async connect (): Promise<void>
    {
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
        if (!this.running)
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

    private clearTimer (): void
    {
        if (this.timer)
        {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
