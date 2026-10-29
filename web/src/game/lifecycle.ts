// Subscription lifetimes, kept free of Phaser imports so they can be unit tested.
// Phaser's EventEmitter (eventemitter3) and Node's EventEmitter both fit this shape.

export interface Emitter
{
    on (event: string, fn: (...args: never[]) => void, context?: unknown): unknown;
    once (event: string, fn: (...args: never[]) => void, context?: unknown): unknown;
    off (event: string, fn: (...args: never[]) => void, context?: unknown): unknown;
}

/** Runs `fn` once, on whichever of `events` fires first, then detaches from all of them. */
export function onFirst (emitter: Emitter, events: string[], fn: () => void): void
{
    let done = false;
    const run = () =>
    {
        if (done)
        {
            return;
        }
        done = true;
        events.forEach(e => emitter.off(e, run));
        fn();
    };
    events.forEach(e => emitter.once(e, run));
}

/** Subscribes `fn` on `source` until any of `stopEvents` fires on `owner`. */
export function subscribeUntil<T extends unknown[]> (
    source: Emitter,
    event: string,
    fn: (...args: T) => void,
    context: unknown,
    owner: Emitter,
    stopEvents: string[]
): void
{
    const handler = fn as unknown as (...args: never[]) => void;
    source.on(event, handler, context);
    onFirst(owner, stopEvents, () => source.off(event, handler, context));
}
