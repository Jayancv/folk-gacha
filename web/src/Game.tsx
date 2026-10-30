import { useEffect, useState } from 'react';
import type { Me } from './auth/useAuth';
import { UserChip } from './screens/UserChip';
import { PhaserGame } from './PhaserGame';
import { ApiStatus } from './app/ApiStatus';
import { EventBus } from './bridge/EventBus';
import { GameEvents, MergeBoardEvents, PackOpenEvents, type GameScene, type PackShowPayload } from './bridge/events';
import { useBridgeEvent } from './bridge/useBridgeEvent';
import { seasonSource, templateSource, type CardSource } from './dev/fakePack';
import { FakeGameServer } from './dev/fakeServer';
import { loadSeasonCatalog } from './dev/seasonCatalog';
import { BOARD_SIZE } from './game/merge/boardModel';
import { Collection } from './screens/collection/Collection';

// Phase 1: packs and merges on the table are still faked in the browser from the Season 1
// catalog. In Phase 2 these become API calls (POST /packs/daily/claim, POST /merges).
// The Cards tab already shows the real collection (GET /cards).
// Add ?showcase to the URL to get one card of every rarity in each pack.
function makeServer (source: CardSource): FakeGameServer
{
    const showcase = new URLSearchParams(location.search).has('showcase');
    return new FakeGameServer({ source, packSource: () => (showcase ? source.showcase() : source.pack()) });
}

// Pack and Board are Phaser scenes; Cards is a React screen over the (sleeping) table.
type Tab = GameScene | 'Collection';

const TABS: { tab: Tab; label: string; icon: string }[] = [
    { tab: 'PackOpen', label: 'Pack', icon: 'M4 7h16v12H4zM7 4h10v3H7z' },
    { tab: 'MergeBoard', label: 'Board', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
    { tab: 'Collection', label: 'Cards', icon: 'M8 3h11v15H8zM5 6v15h11' }
];

// The game for a signed-in player. Loaded lazily (with Phaser) after sign-in.
export default function Game ({ me }: { me: Me })
{
    const [server, setServer] = useState<FakeGameServer | null>(null);

    useEffect(() =>
    {
        let cancelled = false;
        loadSeasonCatalog()
            .then(catalog => seasonSource(catalog))
            .catch((err: unknown) =>
            {
                console.warn('Season catalog unavailable, using plain template cards', err);
                return templateSource;
            })
            .then(source =>
            {
                if (!cancelled)
                {
                    setServer(makeServer(source));
                }
            });
        return () =>
        {
            cancelled = true;
        };
    }, []);

    if (!server)
    {
        return <div id="app" className="grid place-items-center text-sm text-[#bba595]">Loading cards…</div>;
    }
    return <Table server={server} me={me} />;
}

// The game table: Phaser plus the React UI around it. Phaser drives the table;
// React only re-renders for its own UI.
function Table ({ server, me }: { server: FakeGameServer; me: Me })
{
    const [scene, setScene] = useState<GameScene>('PackOpen');
    const [tab, setTab] = useState<Tab>('PackOpen');
    // The collection stays mounted after its first visit, keeping its filters and scroll.
    const [collectionOpened, setCollectionOpened] = useState(false);
    const [packDone, setPackDone] = useState(false);

    const showPack = (cards: PackShowPayload['cards']) =>
    {
        setPackDone(false);
        EventBus.emit(PackOpenEvents.Show, { cards });
    };

    const dealNewPack = () => showPack(server.claimPack());

    // Coming back to the Pack tab re-shows the current pack instead of granting a new one.
    useBridgeEvent(PackOpenEvents.Ready, () => showPack(server.packToShow().cards));
    useBridgeEvent(PackOpenEvents.Complete, () => setPackDone(true));

    useBridgeEvent(MergeBoardEvents.Ready, () => EventBus.emit(MergeBoardEvents.Show, server.board(BOARD_SIZE)));
    useBridgeEvent(MergeBoardEvents.MergeRequested, ({ requestId, cardIds }) =>
    {
        server.merge(requestId, cardIds, result => EventBus.emit(MergeBoardEvents.MergeResult, result));
    });

    const switchTo = (next: Tab) =>
    {
        const wasCollection = tab === 'Collection';
        setTab(next);
        if (next === 'Collection')
        {
            setCollectionOpened(true);
            EventBus.emit(GameEvents.SetPaused, { paused: true });
            return;
        }
        if (wasCollection)
        {
            EventBus.emit(GameEvents.SetPaused, { paused: false });
        }
        if (next !== scene)
        {
            setScene(next);
            EventBus.emit(GameEvents.SwitchScene, { scene: next });
        }
    };

    return (
        <div id="app">
            <PhaserGame />
            {collectionOpened && (
                <div hidden={tab !== 'Collection'}>
                    <Collection />
                </div>
            )}
            <ApiStatus />
            <UserChip me={me} />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                {tab === 'PackOpen' && packDone && (
                    <button
                        className="pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95"
                        onClick={dealNewPack}
                    >
                        Open another pack (dev)
                    </button>
                )}

                <nav className="pointer-events-auto flex gap-1 rounded-2xl border border-[#3b2529] bg-[#22151a]/90 p-1 shadow-lg backdrop-blur">
                    {TABS.map(t => (
                        <button
                            key={t.tab}
                            onClick={() => switchTo(t.tab)}
                            aria-current={tab === t.tab ? 'page' : undefined}
                            className={`flex min-w-20 flex-col items-center gap-0.5 rounded-xl px-4 py-2 text-xs font-bold tracking-wide ${
                                tab === t.tab ? 'bg-[#e7b54a] text-[#170e10]' : 'text-[#bba595] active:bg-white/5'
                            }`}
                        >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                                <path d={t.icon} />
                            </svg>
                            {t.label}
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
}

