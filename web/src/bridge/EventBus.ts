import type { BridgeEvents } from './events';

// The only channel between React and Phaser. Typed against BridgeEvents, so an
// unknown event name or a wrong payload is a compile error on both sides.
// Deliberately Phaser-free: React can use it without loading Phaser, and it runs under Vitest.

/** Emit arguments for a payload type: none for `void`, otherwise exactly one payload. */
export type PayloadArgs<P> = [P] extends [void] ? [] : [payload: P];

interface Listener
{
    fn: (payload: never) => void;
    context: unknown;
    once: boolean;
}

export class TypedEventBus<M extends object>
{
    private listeners = new Map<keyof M, Listener[]>();

    on<K extends keyof M> (event: K, fn: (payload: M[K]) => void, context?: unknown): this
    {
        return this.add(event, fn, context, false);
    }

    once<K extends keyof M> (event: K, fn: (payload: M[K]) => void, context?: unknown): this
    {
        return this.add(event, fn, context, true);
    }

    /** Removes `fn` (only for `context`, if given), or every listener of `event` when `fn` is omitted. */
    off<K extends keyof M> (event: K, fn?: (payload: M[K]) => void, context?: unknown): this
    {
        const list = this.listeners.get(event);
        if (!list)
        {
            return this;
        }
        const kept = fn ? list.filter(l => !(l.fn === fn && (context === undefined || l.context === context))) : [];
        if (kept.length)
        {
            this.listeners.set(event, kept);
        }
        else
        {
            this.listeners.delete(event);
        }
        return this;
    }

    /** Calls every listener of `event` in subscription order; returns false if there were none. */
    emit<K extends keyof M> (event: K, ...args: PayloadArgs<M[K]>): boolean
    {
        const list = this.listeners.get(event);
        if (!list)
        {
            return false;
        }
        // Snapshot: listeners may subscribe or unsubscribe while we're calling them.
        for (const l of [...list])
        {
            if (l.once)
            {
                this.remove(event, l);
            }
            (l.fn as (payload: unknown) => void).call(l.context, args[0]);
        }
        return true;
    }

    listenerCount (event: keyof M): number
    {
        return this.listeners.get(event)?.length ?? 0;
    }

    /** Drops every listener (tests, HMR). */
    clear (): void
    {
        this.listeners.clear();
    }

    private add (event: keyof M, fn: (payload: never) => void, context: unknown, once: boolean): this
    {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), { fn, context, once }]);
        return this;
    }

    private remove (event: keyof M, listener: Listener): void
    {
        const kept = (this.listeners.get(event) ?? []).filter(l => l !== listener);
        if (kept.length)
        {
            this.listeners.set(event, kept);
        }
        else
        {
            this.listeners.delete(event);
        }
    }
}

export const EventBus = new TypedEventBus<BridgeEvents>();
