import { useEffect, useRef, useState } from 'react';
import type { OwnedCard } from './api/cards';
import type { Me } from './auth/useAuth';
import type { CardsView } from './app/cardsView';
import { ApiStatus } from './app/ApiStatus';
import { InstallBanner } from './app/install/InstallBanner';
import { LiveNotice } from './app/live/LiveNotice';
import { useLive } from './app/live/useLive';
import { useInstallPrompt } from './app/install/useInstallPrompt';
import { PackReadyToggle } from './app/push/PackReadyToggle';
import { usePushNotifications } from './app/push/usePushNotifications';
import { tabFromUrl } from './app/openTab';
import { TabBar } from './app/TabBar';
import { isReactScreen, useTabs } from './app/useTabs';
import { EventBus } from './bridge/EventBus';
import { GameEvents } from './bridge/events';
import { ShowcaseAgainButton, ShowcasePanel } from './dev/ShowcasePanel';
import { PhaserGame } from './PhaserGame';
import { BoardLoadError } from './screens/board/BoardLoadError';
import { useBoardTable } from './screens/board/useBoardTable';
import { CardsViewSwitch } from './screens/collection/CardsViewSwitch';
import { Collection } from './screens/collection/Collection';
import { BoardFocusChip } from './screens/board/BoardFocusChip';
import { Leaderboard } from './screens/leaderboard/Leaderboard';
import { DailyPackPanel } from './screens/pack/DailyPackPanel';
import { GiftButton } from './screens/pack/GiftButton';
import { nextPackButtonText } from './screens/pack/dailyPack';
import { Help } from './screens/help/Help';
import { Profile } from './screens/profile/Profile';
import { waitingCount } from './screens/trades/tradeModel';
import { openToEnterCount } from './screens/tournaments/tournamentModel';
import { Tournaments } from './screens/tournaments/Tournaments';
import { useTournaments } from './screens/tournaments/useTournaments';
import { Trades } from './screens/trades/Trades';
import { useTrades } from './screens/trades/useTrades';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import { useTutorial } from './tutorial/useTutorial';
import { usePackTable } from './screens/pack/usePackTable';
import { UserChip } from './screens/UserChip';

// The game for a signed-in player. Loaded lazily (with Phaser) after sign-in.
// Phaser drives the table; React owns the data and the UI around it. The server
// decides every outcome (see usePackTable and useBoardTable).
export default function Game ({ me }: { me: Me })
{
    const { tab, collectionOpened, switchTo, openNav, showCardsView } = useTabs();
    const pack = usePackTable(tab === 'PackOpen');
    // A tapped notification opens a tab: "/?tab=trades" when the app starts from it, or a
    // message from the service worker when the app was already open.
    const switchRef = useRef(switchTo);
    switchRef.current = switchTo;
    useEffect(() =>
    {
        const start = tabFromUrl(window.location.href);
        if (start)
        {
            switchRef.current(start);
            window.history.replaceState(null, '', window.location.pathname);
        }
        const onMessage = (e: MessageEvent) =>
        {
            const next = e.data?.type === 'open-url' ? tabFromUrl(String(e.data.url)) : null;
            if (next)
            {
                switchRef.current(next);
            }
        };
        navigator.serviceWorker?.addEventListener('message', onMessage);
        return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
    }, []);
    const board = useBoardTable(tab === 'MergeBoard');
    // The Cards tab: Board / List switch. Tapping Board shows the newest cards again;
    // Merge on a card's sheet opens the Board on that card and its matches.
    const showView = (view: CardsView) =>
    {
        if (view === 'MergeBoard')
        {
            board.focusOn(null);
        }
        showCardsView(view);
    };
    const mergeFrom = (card: OwnedCard) =>
    {
        board.focusOn(card);
        showCardsView('MergeBoard');
    };
    const install = useInstallPrompt();
    const notifications = usePushNotifications();
    // The tab badge; live events refresh it (it polls only while the socket is down).
    const trades = useTrades();
    const tournaments = useTournaments();
    const [notice, setNotice] = useState<string | null>(null);
    useLive(setNotice);
    // A profile opens over any screen (from the player chip or a leaderboard row).
    const [profileOf, setProfileOf] = useState<string | null>(null);
    // How to play, from the "?" next to your name.
    const [helpOpen, setHelpOpen] = useState(false);
    const tutorial = useTutorial(me, {
        tab, packOpened: pack.opened, packRevealed: pack.revealed, boardCards: board.cards, showcase: pack.showcase !== null
    });
    // Over a table scene, the game loop sleeps while the profile or help covers it.
    const coversTable = (profileOf !== null || helpOpen) && !isReactScreen(tab);
    useEffect(() =>
    {
        if (!coversTable)
        {
            return;
        }
        EventBus.emit(GameEvents.SetPaused, { paused: true });
        return () =>
        {
            EventBus.emit(GameEvents.SetPaused, { paused: false });
        };
    }, [coversTable]);
    const gifts = { waiting: me.giftsWaiting, opening: pack.openingGift, error: pack.giftError, onOpen: pack.openGift };
    // Offer installing while the player waits for tomorrow's pack: a natural moment, and no cards on the table to cover.
    const waitingForPack = tab === 'PackOpen' && !pack.opened && !pack.showcase && me.dailyPack?.ready === false;

    return (
        <div id="app">
            <PhaserGame />

            {tab === 'PackOpen' && !pack.opened && (pack.showcase ? (
                <ShowcasePanel ready={pack.showcase.ready} onDeal={pack.showcase.deal} />
            ) : (
                <DailyPackPanel
                    status={me.dailyPack}
                    claiming={pack.claiming}
                    error={pack.claimError}
                    onClaim={pack.claim}
                    onReset={pack.refreshMe}
                    waitingFooter={<PackReadyToggle state={notifications.state} busy={notifications.busy} onTurnOn={notifications.turnOn} onTurnOff={notifications.turnOff} />}
                    gifts={gifts}
                />
            ))}

            {tab === 'MergeBoard' && (
                <div className="pointer-events-none fixed inset-x-0 top-12 px-4">
                    <div className="mx-auto flex max-w-3xl items-center gap-2">
                        <CardsViewSwitch view="MergeBoard" onChange={showView} />
                        {board.focusCard && <BoardFocusChip card={board.focusCard} onClear={() => board.focusOn(null)} />}
                    </div>
                </div>
            )}
            {tab === 'MergeBoard' && board.loadError && <BoardLoadError onRetry={board.retry} />}

            {collectionOpened && (
                <div hidden={tab !== 'Collection'}>
                    <Collection viewSwitch={<CardsViewSwitch view="Collection" onChange={showView} />} onMerge={mergeFrom} />
                </div>
            )}
            {tab === 'Trades' && <Trades me={me} onOpenProfile={setProfileOf} />}
            {tab === 'Tournaments' && <Tournaments me={me} onOpenProfile={setProfileOf} />}
            {tab === 'Leaderboard' && <Leaderboard me={me} onOpenProfile={setProfileOf} />}
            {notice && (
                <LiveNotice
                    text={notice}
                    onView={tab === 'Trades' ? undefined : () =>
                    {
                        setProfileOf(null);
                        switchTo('Trades');
                    }}
                    onClose={() => setNotice(null)}
                />
            )}
            <ApiStatus />
            <UserChip me={me} onOpenProfile={() => setProfileOf(me.username)} onOpenHelp={() => setHelpOpen(true)} />
            {tutorial.active && !profileOf && !helpOpen && (
                <TutorialOverlay content={tutorial.content} number={tutorial.number} onNext={tutorial.next} onSkip={tutorial.skip} />
            )}
            {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
            {profileOf && (
                <Profile
                    username={profileOf}
                    me={me}
                    onClose={() => setProfileOf(null)}
                    onTradeSent={() =>
                    {
                        setProfileOf(null);
                        switchTo('Trades');
                    }}
                />
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                {tab === 'PackOpen' && pack.showcase && pack.revealed && <ShowcaseAgainButton onDeal={pack.showcase.deal} />}
                {/* Saved-up packs: open the next one once this one is flipped. */}
                {tab === 'PackOpen' && pack.packOnTable && pack.revealed && !pack.showcase && (me.dailyPack?.waiting ?? 0) > 0 && (
                    <button
                        onClick={pack.claim}
                        disabled={pack.claiming}
                        className="pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-2.5 text-sm font-bold text-[#170e10] shadow-lg active:scale-95 disabled:opacity-60"
                    >
                        {pack.claiming ? 'Opening…' : nextPackButtonText(me.dailyPack?.waiting ?? 0)}
                    </button>
                )}
                {tab === 'PackOpen' && pack.packOnTable && pack.revealed && !pack.showcase && me.giftsWaiting > 0 && <GiftButton gifts={gifts} />}
                {waitingForPack && install.offer && <InstallBanner offer={install.offer} onInstall={install.install} onDismiss={install.dismiss} />}
                <TabBar tab={tab} onSwitch={openNav} badges={{ Trades: waitingCount(trades.data ?? []), Tournaments: openToEnterCount(tournaments.data?.tournaments ?? []) }} />
            </div>
        </div>
    );
}
