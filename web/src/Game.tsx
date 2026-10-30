import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ME_KEY, type Me } from './auth/useAuth';
import { UserChip } from './screens/UserChip';
import { PhaserGame } from './PhaserGame';
import { ApiStatus } from './app/ApiStatus';
import { claimDailyPack, loadBoard, mergeCards, type ClaimError } from './api/game';
import { EventBus } from './bridge/EventBus';
import { GameEvents, MergeBoardEvents, PackOpenEvents, type GameScene } from './bridge/events';
import { useBridgeEvent } from './bridge/useBridgeEvent';
import type { CardData } from './game/cards/model';
import { BOARD_SIZE, RESULT_TIMEOUT_MS } from './game/merge/boardModel';
import { Collection } from './screens/collection/Collection';
import { CARDS_KEY } from './screens/collection/useCollection';
import { DailyPackPanel } from './screens/pack/DailyPackPanel';

// The server decides every outcome: packs come from POST /packs/daily/claim, the board
// from GET /cards, merges from POST /merges. Phaser only animates what it's sent.
// Dev only: ?showcase deals local packs with one card of every rarity, for tuning effects.
const SHOWCASE = new URLSearchParams(location.search).has('showcase');

// Pack and Board are Phaser scenes; Cards is a React screen over the (sleeping) table.
type Tab = GameScene | 'Collection';

const TABS: { tab: Tab; label: string; icon: string }[] = [
    { tab: 'PackOpen', label: 'Pack', icon: 'M4 7h16v12H4zM7 4h10v3H7z' },
    { tab: 'MergeBoard', label: 'Board', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
    { tab: 'Collection', label: 'Cards', icon: 'M8 3h11v15H8zM5 6v15h11' }
];

/** Today's opened pack, kept for this session so the Pack tab can show it again. */
interface OpenedPack
{
    cards: CardData[];
    /** When it stops being today's pack (the next 00:00 UTC). */
    expiresAt: number;
}

// The game for a signed-in player. Loaded lazily (with Phaser) after sign-in.
// Phaser drives the table; React owns the data and the UI around it.
export default function Game ({ me }: { me: Me })
{
    const qc = useQueryClient();
    const [scene, setScene] = useState<GameScene>('PackOpen');
    const [tab, setTab] = useState<Tab>('PackOpen');
    // The collection stays mounted after its first visit, keeping its filters and scroll.
    const [collectionOpened, setCollectionOpened] = useState(false);

    const [pack, setPack] = useState<OpenedPack | null>(null);
    const [packDone, setPackDone] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [claimError, setClaimError] = useState<ClaimError | null>(null);
    const [boardError, setBoardError] = useState(false);
    const showcase = useShowcase();

    const refreshMe = useCallback(() => void qc.invalidateQueries({ queryKey: ME_KEY }), [qc]);
    const refreshCollection = () => void qc.invalidateQueries({ queryKey: CARDS_KEY });

    // ---------- Pack ----------

    const showPack = (cards: CardData[]) =>
    {
        setPackDone(false);
        EventBus.emit(PackOpenEvents.Show, { cards });
    };

    const claim = async () =>
    {
        setClaiming(true);
        setClaimError(null);
        const outcome = await claimDailyPack();
        setClaiming(false);
        if (outcome.ok)
        {
            setPack({ cards: outcome.cards, expiresAt: Date.parse(outcome.nextResetAt) });
            showPack(outcome.cards);
            refreshCollection();
        }
        else
        {
            setClaimError(outcome.error);
        }
        // Today's status changed (or we learned it was already claimed, or the session ended).
        refreshMe();
    };

    const dealShowcase = () =>
    {
        if (showcase)
        {
            const cards = showcase();
            setPack({ cards, expiresAt: Infinity });
            showPack(cards);
        }
    };

    // At the next 00:00 UTC today's pack is yesterday's: offer the new one.
    useEffect(() =>
    {
        if (!pack || pack.expiresAt === Infinity)
        {
            return;
        }
        const timer = setTimeout(() =>
        {
            setPack(null);
            refreshMe();
        }, Math.max(0, pack.expiresAt - Date.now()));
        return () => clearTimeout(timer);
    }, [pack, refreshMe]);

    // Coming back to the Pack tab re-shows the opened pack (if any).
    useBridgeEvent(PackOpenEvents.Ready, () =>
    {
        if (pack)
        {
            showPack(pack.cards);
        }
    });
    useBridgeEvent(PackOpenEvents.Complete, () => setPackDone(true));

    // ---------- Board ----------

    // Only the newest board load may lay out cards (an older, slower one is dropped).
    const boardLoad = useRef(0);
    const refreshBoard = async () =>
    {
        const id = ++boardLoad.current;
        try
        {
            const board = await loadBoard(BOARD_SIZE);
            if (id === boardLoad.current)
            {
                setBoardError(false);
                EventBus.emit(MergeBoardEvents.Show, board);
            }
        }
        catch (err)
        {
            console.warn('board: could not load cards', err);
            if (id === boardLoad.current)
            {
                setBoardError(true);
            }
        }
    };

    useBridgeEvent(MergeBoardEvents.Ready, () => void refreshBoard());
    useBridgeEvent(MergeBoardEvents.MergeRequested, async ({ requestId, cardIds }) =>
    {
        const started = performance.now();
        const { result, status } = await mergeCards(requestId, cardIds);
        EventBus.emit(MergeBoardEvents.MergeResult, result);

        if (status === 401)
        {
            refreshMe(); // session ended: back to sign-in
            return;
        }
        // The board may no longer match the server: the answer came after the board gave
        // up waiting, or never came, or a card was used elsewhere (another device).
        const late = performance.now() - started >= RESULT_TIMEOUT_MS;
        const unsure = !result.ok && (result.error === 'network' || result.error === 'not_owned');
        if (result.ok || late || unsure)
        {
            refreshCollection();
        }
        if (late || unsure)
        {
            setTimeout(() => void refreshBoard(), 1200); // after the failure animation
        }
    });

    // ---------- Tabs ----------

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

            {tab === 'PackOpen' && !pack && (SHOWCASE ? (
                <DevPanel onDeal={dealShowcase} ready={showcase !== null} />
            ) : (
                <DailyPackPanel status={me.dailyPack} claiming={claiming} error={claimError} onClaim={() => void claim()} onReset={refreshMe} />
            ))}

            {tab === 'MergeBoard' && boardError && (
                <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center px-4">
                    <p role="alert" className="pointer-events-auto rounded-2xl border border-[#3b2529] bg-[#1c1215]/95 px-5 py-4 text-sm text-[#bba595]">
                        Couldn't load your cards.{' '}
                        <button className="text-[#e7b54a] underline" onClick={() => void refreshBoard()}>Retry</button>
                    </p>
                </div>
            )}

            {collectionOpened && (
                <div hidden={tab !== 'Collection'}>
                    <Collection />
                </div>
            )}
            <ApiStatus />
            <UserChip me={me} />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                {SHOWCASE && tab === 'PackOpen' && packDone && (
                    <button
                        className="pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95"
                        onClick={dealShowcase}
                    >
                        Deal another showcase pack (dev)
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

/**
 * Dev only (?showcase): deals local packs with one card of every rarity from the
 * Season 1 catalog. Loaded on demand so the client-side rolls never ship in the normal game.
 */
function useShowcase (): (() => CardData[]) | null
{
    const [deal, setDeal] = useState<(() => CardData[]) | null>(null);
    useEffect(() =>
    {
        if (!SHOWCASE)
        {
            return;
        }
        let cancelled = false;
        void Promise.all([import('./dev/fakePack'), import('./dev/seasonCatalog')]).then(async ([fake, catalog]) =>
        {
            const source = await catalog.loadSeasonCatalog().then(fake.seasonSource, () => fake.templateSource);
            if (!cancelled)
            {
                setDeal(() => () => source.showcase());
            }
        });
        return () =>
        {
            cancelled = true;
        };
    }, []);
    return deal;
}

function DevPanel ({ onDeal, ready }: { onDeal: () => void; ready: boolean })
{
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
            <button
                onClick={onDeal}
                disabled={!ready}
                className="pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95 disabled:opacity-60"
            >
                {ready ? 'Deal showcase pack (dev)' : 'Loading catalog…'}
            </button>
        </div>
    );
}
