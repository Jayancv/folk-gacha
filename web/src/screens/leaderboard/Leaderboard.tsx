import { useState } from 'react';
import type { Me } from '../../auth/useAuth';
import { weekLabel } from './leaderboardText';
import { Standings } from './Standings';
import { useLeaderboard } from './useLeaderboard';
import { WeekToggle, type Week } from './WeekToggle';

// Weekly leaderboard: this week's live ranks, or last week's final standings.
// Plain React over the sleeping table, like the collection.
export function Leaderboard ({ me, onOpenProfile }: { me: Me; onOpenProfile: (username: string) => void })
{
    const [week, setWeek] = useState<Week>('current');
    const current = useLeaderboard('current');
    const previousId = current.data?.previousId;
    // Last week's board loads only when asked for, once the current one says which week that is.
    const previous = useLeaderboard(previousId ?? 'current', week === 'previous' && previousId !== undefined);
    const board = week === 'previous' && previousId ? previous : current;

    return (
        <section data-scroll-root className="absolute inset-0 z-0 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label="Leaderboard">
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-12 pb-3 backdrop-blur">
                <div className="mx-auto flex max-w-xl items-end gap-2">
                    <div className="mr-auto">
                        <h1 className="font-serif text-xl font-bold">Leaderboard</h1>
                        <p className="text-xs text-[#bba595]">{board.data ? weekLabel(board.data.season) : ' '}</p>
                    </div>
                    <WeekToggle week={week} onChange={setWeek} canGoBack={previousId !== undefined} />
                </div>
            </header>

            <div className="mx-auto max-w-xl px-4 pt-3 pb-32">
                {board.isPending ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">Loading…</p>
                ) : board.isError ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">
                        {week === 'previous' ? 'No leaderboard for last week.' : "Couldn't load the leaderboard."}{' '}
                        {week === 'current' && <button className="text-[#e7b54a] underline" onClick={() => void board.refetch()}>Retry</button>}
                    </p>
                ) : (
                    <Standings board={board.data} me={me} onOpenProfile={onOpenProfile} />
                )}
            </div>
        </section>
    );
}
