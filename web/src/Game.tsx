import type { Me } from './auth/useAuth';
import { ApiStatus } from './app/ApiStatus';
import { TabBar } from './app/TabBar';
import { useTabs } from './app/useTabs';
import { ShowcaseAgainButton, ShowcasePanel } from './dev/ShowcasePanel';
import { PhaserGame } from './PhaserGame';
import { BoardLoadError } from './screens/board/BoardLoadError';
import { useBoardTable } from './screens/board/useBoardTable';
import { Collection } from './screens/collection/Collection';
import { Leaderboard } from './screens/leaderboard/Leaderboard';
import { DailyPackPanel } from './screens/pack/DailyPackPanel';
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

    return (
        <div id="app">
            <PhaserGame />

            {tab === 'PackOpen' && !pack.opened && (pack.showcase ? (
                <ShowcasePanel ready={pack.showcase.ready} onDeal={pack.showcase.deal} />
            ) : (
                <DailyPackPanel status={me.dailyPack} claiming={pack.claiming} error={pack.claimError} onClaim={pack.claim} onReset={pack.refreshMe} />
            ))}

            {tab === 'MergeBoard' && board.loadError && <BoardLoadError onRetry={board.retry} />}

            {collectionOpened && (
                <div hidden={tab !== 'Collection'}>
                    <Collection />
                </div>
            )}
            {tab === 'Leaderboard' && <Leaderboard me={me} />}
            <ApiStatus />
            <UserChip me={me} />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                {tab === 'PackOpen' && pack.showcase && pack.revealed && <ShowcaseAgainButton onDeal={pack.showcase.deal} />}
                <TabBar tab={tab} onSwitch={switchTo} />
            </div>
        </div>
    );
}
