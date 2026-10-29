import { describe, expect, it } from 'vitest';
import type { MergeResultPayload } from '../game/events';
import { makeCard, TEMPLATES } from './fakePack';
import { FakeGameServer } from './fakeServer';

const t = (id: string) => TEMPLATES.find(t => t.templateId === id)!;

// Runs merges synchronously and records the latency each one was given.
function setup (starterIds: string[], packIds: string[][] = [])
{
    const delays: number[] = [];
    let pack = 0;
    const server = new FakeGameServer({
        starter: starterIds.map(id => makeCard(t(id))),
        packSource: () => (packIds[pack++] ?? []).map(id => makeCard(t(id))),
        latency: () => 400,
        schedule: (fn, ms) => { delays.push(ms); fn(); }
    });
    return { server, delays };
}

function mergeNow (server: FakeGameServer, ids: [string, string]): MergeResultPayload
{
    let result: MergeResultPayload | undefined;
    server.merge('req-1', ids, r => { result = r; });
    return result!;
}

describe('FakeGameServer packs', () =>
{
    it('adds claimed cards to the collection straight away', () =>
    {
        const { server } = setup(['malu'], [['ura', 'simha']]);
        const pack = server.claimPack();
        expect(pack.map(c => c.templateId)).toEqual(['ura', 'simha']);
        expect(server.cards).toHaveLength(3);
        expect(server.currentPack).toEqual(pack);
    });

    it('re-shows the current pack without granting its cards twice', () =>
    {
        const { server } = setup([], [['ura'], ['makara']]);
        const first = server.packToShow();
        const again = server.packToShow();
        expect(first.isNew).toBe(true);
        expect(again.isNew).toBe(false);
        expect(again.cards.map(c => c.id)).toEqual(first.cards.map(c => c.id));
        expect(server.cards).toHaveLength(1);
    });

    it('a new claim replaces the current pack', () =>
    {
        const { server } = setup([], [['ura'], ['makara']]);
        server.packToShow();
        server.claimPack();
        expect(server.packToShow().cards[0].templateId).toBe('makara');
        expect(server.cards).toHaveLength(2);
    });
});

describe('FakeGameServer board', () =>
{
    it('returns the newest cards that fit and the total owned', () =>
    {
        const ids = ['malu', 'ura', 'simha', 'monara', 'gaja-calf'];
        const { server } = setup(ids);
        const board = server.board(3);
        expect(board.total).toBe(5);
        expect(board.cards.map(c => c.templateId)).toEqual(['simha', 'monara', 'gaja-calf']);
    });

    it('returns everything when the collection fits', () =>
    {
        const { server } = setup(['malu', 'ura']);
        expect(server.board(16).cards).toHaveLength(2);
    });
});

describe('FakeGameServer merges', () =>
{
    it('answers after the simulated latency and updates the collection', () =>
    {
        const { server, delays } = setup(['malu', 'malu', 'ura']);
        const [a, b] = server.cards;
        const result = mergeNow(server, [a.id, b.id]);

        expect(delays).toEqual([400]);
        expect(result).toMatchObject({ requestId: 'req-1', ok: true, kind: 'level_up' });
        expect(server.cards.map(c => `${c.templateId}@${c.level}`)).toEqual(['ura@1', 'malu@2']);
    });

    it('merged cards are gone, so merging them again fails', () =>
    {
        const { server } = setup(['malu', 'malu']);
        const [a, b] = server.cards;
        mergeNow(server, [a.id, b.id]);
        expect(mergeNow(server, [a.id, b.id])).toMatchObject({ ok: false, error: 'not_owned' });
    });

    it('remembers discovered recipes across merges', () =>
    {
        const { server } = setup(['gaja-calf', 'simha', 'gaja-calf', 'simha']);
        const [g1, s1, g2, s2] = server.cards;
        expect(mergeNow(server, [g1.id, s1.id])).toMatchObject({ ok: true, kind: 'recipe', discovered: true });
        expect(mergeNow(server, [s2.id, g2.id])).toMatchObject({ ok: true, kind: 'recipe', discovered: false });
    });

    it('leaves the collection unchanged when a merge fails', () =>
    {
        const { server } = setup(['malu', 'ura']);
        const before = server.cards.map(c => c.id);
        const [a, b] = server.cards;
        expect(mergeNow(server, [a.id, b.id])).toMatchObject({ ok: false, error: 'no_recipe' });
        expect(server.cards.map(c => c.id)).toEqual(before);
    });

    it('uses the collection as it is when the answer is sent, not when requested', () =>
    {
        // Two requests for the same pair in flight: only the first can succeed.
        const queue: (() => void)[] = [];
        const server = new FakeGameServer({
            starter: [makeCard(t('malu')), makeCard(t('malu'))],
            latency: () => 1,
            schedule: fn => { queue.push(fn); }
        });
        const [a, b] = server.cards;
        const results: MergeResultPayload[] = [];
        server.merge('first', [a.id, b.id], r => results.push(r));
        server.merge('second', [a.id, b.id], r => results.push(r));
        queue.forEach(fn => fn());

        expect(results[0]).toMatchObject({ requestId: 'first', ok: true });
        expect(results[1]).toMatchObject({ requestId: 'second', ok: false, error: 'not_owned' });
    });
});
