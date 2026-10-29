// PHASE 1 ONLY: an in-browser stand-in for the API so React can drive the table scenes.
// Phase 2 replaces each method with a real call:
//   claimPack -> POST /packs/daily/claim, board -> GET /cards, merge -> POST /merges.

import type { CardData } from '../game/cards/model';
import type { BoardShowPayload, MergeResultPayload } from '../game/events';
import { fakeClaimPack } from './fakePack';
import { fakeMerge, fakeStarterCollection } from './fakeMerge';

export interface FakeServerOptions
{
    starter?: CardData[];
    packSource?: () => CardData[];
    /** Simulated network delay in ms for merges. */
    latency?: () => number;
    /** Defaults to setTimeout; tests pass a synchronous scheduler. */
    schedule?: (fn: () => void, ms: number) => void;
}

export class FakeGameServer
{
    private collection: CardData[];
    private pack: CardData[] | null = null;
    private readonly discovered = new Set<string>();
    private readonly packSource: () => CardData[];
    private readonly latency: () => number;
    private readonly schedule: (fn: () => void, ms: number) => void;

    constructor (options: FakeServerOptions = {})
    {
        this.collection = options.starter ?? fakeStarterCollection();
        this.packSource = options.packSource ?? (() => fakeClaimPack());
        this.latency = options.latency ?? (() => 250 + Math.random() * 650);
        this.schedule = options.schedule ?? ((fn, ms) => { setTimeout(fn, ms); });
    }

    get cards (): readonly CardData[]
    {
        return this.collection;
    }

    get currentPack (): readonly CardData[] | null
    {
        return this.pack;
    }

    /** Rolls a new pack. Its cards are owned immediately, like the server's claim transaction. */
    claimPack (): CardData[]
    {
        const cards = this.packSource();
        this.collection = [...this.collection, ...cards];
        this.pack = cards;
        return cards;
    }

    /** The pack to show on the Pack tab: the current one if any, otherwise a fresh claim. */
    packToShow (): { cards: CardData[]; isNew: boolean }
    {
        if (this.pack)
        {
            return { cards: [...this.pack], isNew: false };
        }
        return { cards: this.claimPack(), isNew: true };
    }

    /** The newest `size` cards for the board, plus the total owned. */
    board (size: number): BoardShowPayload
    {
        return { cards: this.collection.slice(-size), total: this.collection.length };
    }

    /** Resolves a merge after simulated latency and reports the result. */
    merge (requestId: string, cardIds: [string, string], respond: (result: MergeResultPayload) => void): void
    {
        this.schedule(() =>
        {
            const outcome = fakeMerge(this.collection, requestId, cardIds, this.discovered);
            this.collection = outcome.collection;
            respond(outcome.result);
        }, this.latency());
    }
}
