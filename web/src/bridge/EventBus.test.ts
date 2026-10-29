import { describe, expect, it, vi } from 'vitest';
import { EventBus, TypedEventBus } from './EventBus';
import { GameEvents, MergeBoardEvents, PackOpenEvents, type BridgeEvents } from './events';

interface TestEvents
{
    ping: void;
    count: number;
    card: { id: string };
}

const bus = () => new TypedEventBus<TestEvents>();

describe('TypedEventBus', () =>
{
    it('delivers payloads to listeners in subscription order', () =>
    {
        const b = bus();
        const seen: string[] = [];
        b.on('count', n => seen.push(`a${n}`));
        b.on('count', n => seen.push(`b${n}`));

        expect(b.emit('count', 3)).toBe(true);
        expect(seen).toEqual(['a3', 'b3']);
    });

    it('emits payload-less events with no arguments', () =>
    {
        const b = bus();
        const fn = vi.fn();
        b.on('ping', fn);
        b.emit('ping');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns false when nobody is listening', () =>
    {
        expect(bus().emit('count', 1)).toBe(false);
    });

    it('once listeners run a single time', () =>
    {
        const b = bus();
        const fn = vi.fn();
        b.once('count', fn);
        b.emit('count', 1);
        b.emit('count', 2);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith(1);
        expect(b.listenerCount('count')).toBe(0);
    });

    it('calls listeners with their context as this', () =>
    {
        const b = bus();
        const scene = { name: 'MergeBoard', got: '' };
        b.on('card', function (this: typeof scene, c) { this.got = `${this.name}:${c.id}`; }, scene);
        b.emit('card', { id: 'x1' });
        expect(scene.got).toBe('MergeBoard:x1');
    });

    it('off with a context removes only that context\'s listener', () =>
    {
        // Two scenes sharing one handler function (e.g. a prototype method) must not unsubscribe each other.
        const b = bus();
        const fn = vi.fn();
        const sceneA = {};
        const sceneB = {};
        b.on('count', fn, sceneA);
        b.on('count', fn, sceneB);

        b.off('count', fn, sceneA);
        b.emit('count', 1);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn.mock.contexts[0]).toBe(sceneB);
    });

    it('off without a function removes every listener of that event only', () =>
    {
        const b = bus();
        b.on('count', () => {});
        b.on('count', () => {});
        b.on('ping', () => {});

        b.off('count');

        expect(b.listenerCount('count')).toBe(0);
        expect(b.listenerCount('ping')).toBe(1);
    });

    it('a listener removing itself mid-emit does not skip the next one', () =>
    {
        const b = bus();
        const second = vi.fn();
        const first = () => b.off('count', first);
        b.on('count', first);
        b.on('count', second);

        b.emit('count', 1);

        expect(second).toHaveBeenCalledTimes(1);
        expect(b.listenerCount('count')).toBe(1);
    });

    it('a listener added mid-emit waits for the next emit', () =>
    {
        const b = bus();
        const late = vi.fn();
        b.once('count', () => b.on('count', late));

        b.emit('count', 1);
        expect(late).not.toHaveBeenCalled();

        b.emit('count', 2);
        expect(late).toHaveBeenCalledWith(2);
    });

    it('clear drops everything', () =>
    {
        const b = bus();
        b.on('count', () => {});
        b.on('ping', () => {});
        b.clear();
        expect(b.emit('count', 1)).toBe(false);
        expect(b.emit('ping')).toBe(false);
    });

    it('rejects unknown events and wrong payloads at compile time', () =>
    {
        const b = bus();
        // @ts-expect-error unknown event
        b.on('nope', () => {});
        // @ts-expect-error payload must be a number
        b.emit('count', 'three');
        // @ts-expect-error payload required
        b.emit('count');
        // @ts-expect-error void events take no payload
        b.emit('ping', 1);
        expect(true).toBe(true);
    });
});

describe('EventBus (React <-> Phaser)', () =>
{
    it('round-trips a merge request and its result', () =>
    {
        // Mirrors App.tsx + MergeBoard: Phaser asks, React answers with the server's result.
        const answers: BridgeEvents[typeof MergeBoardEvents.MergeResult][] = [];
        const onRequest = ({ requestId }: BridgeEvents[typeof MergeBoardEvents.MergeRequested]) =>
            EventBus.emit(MergeBoardEvents.MergeResult, { requestId, ok: false, error: 'no_recipe' });
        const onResult = (r: BridgeEvents[typeof MergeBoardEvents.MergeResult]) => answers.push(r);

        EventBus.on(MergeBoardEvents.MergeRequested, onRequest);
        EventBus.on(MergeBoardEvents.MergeResult, onResult);
        try
        {
            EventBus.emit(MergeBoardEvents.MergeRequested, { requestId: 'r1', cardIds: ['a', 'b'] });
            expect(answers).toEqual([{ requestId: 'r1', ok: false, error: 'no_recipe' }]);
        }
        finally
        {
            EventBus.off(MergeBoardEvents.MergeRequested, onRequest);
            EventBus.off(MergeBoardEvents.MergeResult, onResult);
        }
    });

    it('event names are unique across scenes', () =>
    {
        const names = [...Object.values(PackOpenEvents), ...Object.values(MergeBoardEvents), ...Object.values(GameEvents)];
        expect(new Set(names).size).toBe(names.length);
    });

    it('checks bridge payloads at compile time', () =>
    {
        const off = () => {};
        // @ts-expect-error Show needs { cards }
        EventBus.emit(PackOpenEvents.Show, { card: [] });
        // @ts-expect-error not a scene
        EventBus.emit(GameEvents.SwitchScene, { scene: 'Shop' });
        // @ts-expect-error not a bridge event (old template event)
        EventBus.on('current-scene-ready', off);
        EventBus.off(PackOpenEvents.Show);
        EventBus.off(GameEvents.SwitchScene);
        expect(true).toBe(true);
    });
});
