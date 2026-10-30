import type { Me } from '../../auth/useAuth';
import { LeaderboardRow } from './LeaderboardRow';
import { StatusLine } from './StatusLine';
import type { Leaderboard } from './useLeaderboard';
import { YourRankCard } from './YourRankCard';

// One week's standings: status, your rank, the top players (or an empty state), and how points work.
export function Standings ({ board, me, onOpenProfile }: { board: Leaderboard; me: Me; onOpenProfile: (username: string) => void })
{
    return (
        <>
            <StatusLine board={board} />
            <YourRankCard board={board} />
            {board.top.length === 0 ? (
                <p className="py-12 text-center text-sm text-[#bba595]">
                    {board.final ? 'Nobody scored that week.' : 'No points yet this week. Open your pack or merge cards to get on the board.'}
                </p>
            ) : (
                <ol className="mt-3 flex flex-col gap-1.5" aria-label="Top players">
                    {board.top.map(e => <LeaderboardRow key={e.rank} entry={e} mine={e.username === me.username} onOpen={() => onOpenProfile(e.username)} />)}
                </ol>
            )}
            <p className="mt-4 text-center text-xs text-[#bba595]/80">
                Points come from cards you pull and merge each week. The top 3 win a cosmetic reward.
            </p>
        </>
    );
}
