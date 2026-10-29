import { useEffect, useRef, useState } from 'react';
import { PhaserGame } from './PhaserGame';
import { ApiStatus } from './app/ApiStatus';
import { fakeClaimPack, fakeShowcasePack } from './dev/fakePack';
import { FakeGameServer } from './dev/fakeServer';
import { EventBus } from './game/EventBus';
import {
    GameEvents,
    MergeBoardEvents,
    PackOpenEvents,
    type BoardShowPayload,
    type GameScene,
    type MergeRequestedPayload,
    type PackShowPayload
} from './game/events';
import { BOARD_SIZE } from './game/merge/boardModel';

// Phase 1: the collection, packs and merges are faked in the browser.
// In Phase 2 these become API calls (POST /packs/daily/claim, POST /merges, GET /cards).
// Add ?showcase to the URL to get one card of every rarity in each pack.
function nextPack ()
{
    return new URLSearchParams(location.search).has('showcase') ? fakeShowcasePack() : fakeClaimPack();
}

const TABS: { scene: GameScene; label: string; icon: string }[] = [
    { scene: 'PackOpen', label: 'Pack', icon: 'M4 7h16v12H4zM7 4h10v3H7z' },
    { scene: 'MergeBoard', label: 'Board', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' }
];

function App()
{
    const [scene, setScene] = useState<GameScene>('PackOpen');
    const [packDone, setPackDone] = useState(false);

    // Kept in a ref: Phaser drives the table, React only re-renders for its own UI.
    const server = useRef(new FakeGameServer({ packSource: nextPack }));

    const showPack = (cards: PackShowPayload['cards']) =>
    {
        setPackDone(false);
        const payload: PackShowPayload = { cards };
        EventBus.emit(PackOpenEvents.Show, payload);
    };

    const dealNewPack = () => showPack(server.current.claimPack());

    useEffect(() =>
    {
        // Coming back to the Pack tab re-shows the current pack instead of granting a new one.
        const onPackReady = () => showPack(server.current.packToShow().cards);
        const onPackComplete = () => setPackDone(true);

        const onBoardReady = () =>
        {
            const payload: BoardShowPayload = server.current.board(BOARD_SIZE);
            EventBus.emit(MergeBoardEvents.Show, payload);
        };

        const onMergeRequested = ({ requestId, cardIds }: MergeRequestedPayload) =>
        {
            server.current.merge(requestId, cardIds, result => EventBus.emit(MergeBoardEvents.MergeResult, result));
        };

        EventBus.on(PackOpenEvents.Ready, onPackReady);
        EventBus.on(PackOpenEvents.Complete, onPackComplete);
        EventBus.on(MergeBoardEvents.Ready, onBoardReady);
        EventBus.on(MergeBoardEvents.MergeRequested, onMergeRequested);
        return () =>
        {
            EventBus.off(PackOpenEvents.Ready, onPackReady);
            EventBus.off(PackOpenEvents.Complete, onPackComplete);
            EventBus.off(MergeBoardEvents.Ready, onBoardReady);
            EventBus.off(MergeBoardEvents.MergeRequested, onMergeRequested);
        };
    }, []);

    const switchTo = (next: GameScene) =>
    {
        setScene(next);
        EventBus.emit(GameEvents.SwitchScene, { scene: next });
    };

    return (
        <div id="app">
            <PhaserGame />
            <ApiStatus />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                {scene === 'PackOpen' && packDone && (
                    <button
                        className="pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95"
                        onClick={dealNewPack}
                    >
                        Open another pack (dev)
                    </button>
                )}

                <nav className="pointer-events-auto flex gap-1 rounded-2xl border border-[#3b2529] bg-[#22151a]/90 p-1 shadow-lg backdrop-blur">
                    {TABS.map(tab => (
                        <button
                            key={tab.scene}
                            onClick={() => switchTo(tab.scene)}
                            aria-current={scene === tab.scene ? 'page' : undefined}
                            className={`flex min-w-24 flex-col items-center gap-0.5 rounded-xl px-5 py-2 text-xs font-bold tracking-wide ${
                                scene === tab.scene ? 'bg-[#e7b54a] text-[#170e10]' : 'text-[#bba595] active:bg-white/5'
                            }`}
                        >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                                <path d={tab.icon} />
                            </svg>
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
}

export default App
