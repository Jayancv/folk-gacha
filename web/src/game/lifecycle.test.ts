import { describe, expect, it, vi } from 'vitest';
import { onFirst, subscribeUntil, type Emitter } from './lifecycle';

type Fn = (...args: never[]) => void;

// Minimal emitter with the same on/once/off(event, fn, context) shape as Phaser's.
class TestEmitter implements Emitter
{
    private handlers = new Map<string, { fn: Fn; context: unknown; once: boolean }[]>();

    on (event: string, fn: Fn, context?: unknown) { return this.add(event, fn, context, false); }
    once (event: string, fn: Fn, context?: unknown) { return this.add(event, fn, context, true); }

    off (event: string, fn: Fn, context?: unknown)
    {
        const list = this.handlers.get(event) ?? [];
        this.handlers.set(event, list.filter(h => !(h.fn === fn && (context === undefined || h.context === context))));
        return this;
    }

    emit (event: string, ...args: unknown[])
    {
        for (const h of [...(this.handlers.get(event) ?? [])])
        {
            if (h.once) this.off(event, h.fn, h.context);
            (h.fn as (...a: unknown[]) => void).apply(h.context, args);
        }
    }

    listenerCount (event: string) { return this.handlers.get(event)?.length ?? 0; }

    private add (event: string, fn: Fn, context: unknown, once: boolean)
    {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), { fn, context, once }]);
        return this;
    }
}

const emitter = () => new TestEmitter();

describe('onFirst', () =>
{
    it('runs once on whichever event fires first', () =>
    {
        const e = emitter();
        const fn = vi.fn();
        onFirst(e, ['shutdown', 'destroy'], fn);

        e.emit('destroy');
        e.emit('shutdown');
        e.emit('destroy');

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('detaches from the other events after running', () =>
    {
        const e = emitter();
        onFirst(e, ['shutdown', 'destroy'], () => {});
        e.emit('shutdown');
        expect(e.listenerCount('shutdown')).toBe(0);
        expect(e.listenerCount('destroy')).toBe(0);
    });
});

describe('subscribeUntil', () =>
{
    // Regression: scenes used to unsubscribe from EventBus only on SHUTDOWN. Destroying
    // the Phaser game fires DESTROY instead, so dead scenes kept handling React's events.
    it('unsubscribes when the owner is destroyed, not only on shutdown', () =>
    {
        const bus = emitter();
        const scene = emitter();
        const onShow = vi.fn();
        subscribeUntil(bus, 'pack-open:show', onShow, undefined, scene, ['shutdown', 'destroy']);

        bus.emit('pack-open:show', { cards: [] });
        expect(onShow).toHaveBeenCalledTimes(1);

        scene.emit('destroy');
        bus.emit('pack-open:show', { cards: [] });
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(bus.listenerCount('pack-open:show')).toBe(0);
    });

    it('unsubscribes on shutdown (switching scenes)', () =>
    {
        const bus = emitter();
        const scene = emitter();
        subscribeUntil(bus, 'merge-board:merge-result', () => {}, undefined, scene, ['shutdown', 'destroy']);
        scene.emit('shutdown');
        expect(bus.listenerCount('merge-board:merge-result')).toBe(0);
    });

    it('a restarted scene subscribes again without stacking handlers', () =>
    {
        const bus = emitter();
        const scene = emitter();
        const onShow = vi.fn();
        const start = () => subscribeUntil(bus, 'show', onShow, undefined, scene, ['shutdown', 'destroy']);

        start();
        scene.emit('shutdown');
        start();
        bus.emit('show');

        expect(onShow).toHaveBeenCalledTimes(1);
        expect(bus.listenerCount('show')).toBe(1);
    });

    it('passes event payloads through', () =>
    {
        const bus = emitter();
        const seen: unknown[] = [];
        subscribeUntil(bus, 'result', (r: { ok: boolean }) => seen.push(r), undefined, emitter(), ['shutdown']);
        bus.emit('result', { ok: true });
        expect(seen).toEqual([{ ok: true }]);
    });
});
