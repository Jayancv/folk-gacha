import type { Me } from '../../auth/useAuth';
import { playersText } from './leaderboardText';
import { LeaderboardRow } from './LeaderboardRow';
import type { AllTimeLeaderboard } from './useLeaderboard';

// The all-time standings: every week's points added up. Same rows as a week's board.
export function AllTimeStandings ({ board, me, onOpenProfile }: { board: AllTimeLeaderboard; me: Me; onOpenProfile: (username: string) => void })
{
    const you = board.you;
    return (
        <>
            <p className="text-xs text-[#bba595]">Every week added up · {playersText(board.players)}</p>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#e7b54a]/40 bg-[#22151a] px-4 py-3">
                {you ? (
                    <>
                        <span className="font-serif text-2xl font-bold text-[#e7b54a]">#{you.rank}</span>
                        <span className="mr-auto text-sm text-[#bba595]">Your all-time rank</span>
                        <span className="font-bold">{you.points} pts</span>
                    </>
                ) : (
                    <span className="text-sm text-[#bba595]">You're not ranked yet. Every point you earn counts here too.</span>
                )}
            </div>
            {board.top.length === 0 ? (
                <p className="py-12 text-center text-sm text-[#bba595]">No points yet. Open your pack or merge cards to get on the board.</p>
            ) : (
                <ol className="mt-3 flex flex-col gap-1.5" aria-label="Top players of all time">
                    {board.top.map(e => <LeaderboardRow key={e.rank} entry={e} mine={e.username === me.username} onOpen={() => onOpenProfile(e.username)} />)}
                </ol>
            )}
            <p className="mt-4 text-center text-xs text-[#bba595]/80">
                All the season points you've earned, from every week. Cards from trades and gifts earn none.
            </p>
        </>
    );
}
