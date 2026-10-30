import { useEffect, useState } from 'react';
import type { Me } from './auth/useAuth';
import { ApiStatus } from './app/ApiStatus';
import { InstallBanner } from './app/install/InstallBanner';
import { useInstallPrompt } from './app/install/useInstallPrompt';
import { PackReadyToggle } from './app/push/PackReadyToggle';
import { usePushNotifications } from './app/push/usePushNotifications';
import { TabBar } from './app/TabBar';
import { isReactScreen, useTabs } from './app/useTabs';
import { EventBus } from './bridge/EventBus';
import { GameEvents } from './bridge/events';
import { ShowcaseAgainButton, ShowcasePanel } from './dev/ShowcasePanel';
import { PhaserGame } from './PhaserGame';
import { BoardLoadError } from './screens/board/BoardLoadError';
import { useBoardTable } from './screens/board/useBoardTable';
import { Collection } from './screens/collection/Collection';
import { Leaderboard } from './screens/leaderboard/Leaderboard';
import { DailyPackPanel } from './screens/pack/DailyPackPanel';
import { Profile } from './screens/profile/Profile';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import { useTutorial } from './tutorial/useTutorial';
import { usePackTable } from './screens/pack/usePackTable';
import { UserChip } from './screens/UserChip';

// The game for a signed-in player. Loaded lazily (with Phaser) after sign-in.
// Phaser drives the table; React owns the data and the UI around it. The server
// decides every outcome (see usePackTable and useBoardTable).
export default function Game ({ me }: { me: Me })
{
    const { tab, collectionOpened, switchTo } = useTabs();
    const pack = usePackTable();
    const board = useBoardTable();
    const install = useInstallPrompt();
    const notifications = usePushNotifications();
    // A profile opens over any screen (from the player chip or a leaderboard row).
    const [profileOf, setProfileOf] = useState<string | null>(null);
    const tutorial = useTutorial(me, {
        tab, packOpened: pack.opened, packRevealed: pack.revealed, boardCards: board.cards, showcase: pack.showcase !== null
    });
    // Over a table scene, the game loop sleeps while the profile covers it.
    const coversTable = profileOf !== null && !isReactScreen(tab);
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
                />
            ))}

            {tab === 'MergeBoard' && board.loadError && <BoardLoadError onRetry={board.retry} />}

            {collectionOpened && (
                <div hidden={tab !== 'Collection'}>
                    <Collection />
                </div>
            )}
            {tab === 'Leaderboard' && <Leaderboard me={me} onOpenProfile={setProfileOf} />}
            <ApiStatus />
            <UserChip me={me} onOpenProfile={() => setProfileOf(me.username)} />
            {tutorial.active && !profileOf && (
                <TutorialOverlay content={tutorial.content} number={tutorial.number} onNext={tutorial.next} onSkip={tutorial.skip} />
            )}
            {profileOf && <Profile username={profileOf} me={me} onClose={() => setProfileOf(null)} />}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                {tab === 'PackOpen' && pack.showcase && pack.revealed && <ShowcaseAgainButton onDeal={pack.showcase.deal} />}
                {waitingForPack && install.offer && <InstallBanner offer={install.offer} onInstall={install.install} onDismiss={install.dismiss} />}
                <TabBar tab={tab} onSwitch={switchTo} />
            </div>
        </div>
    );
}
