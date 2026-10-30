import type { Leaderboard } from './useLeaderboard';

// The viewer's own standing, shown above the list even when they're outside the top 100.
export function YourRankCard ({ board }: { board: Leaderboard })
{
    const you = board.you;
    return (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#e7b54a]/40 bg-[#22151a] px-4 py-3">
            {you ? (
                <>
                    <span className="font-serif text-2xl font-bold text-[#e7b54a]">#{you.rank}</span>
                    <span className="mr-auto text-sm text-[#bba595]">{board.final ? 'Your final rank' : 'Your rank'}</span>
                    <span className="font-bold">{you.points} pts</span>
                </>
            ) : (
                <span className="text-sm text-[#bba595]">
                    {board.final ? "You didn't score that week." : "You're not ranked yet this week."}
                </span>
            )}
        </div>
    );
}
