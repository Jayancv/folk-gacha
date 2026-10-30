import { useEffect, useState } from 'react';
import { playersText, timeLeftText } from './leaderboardText';
import type { Leaderboard } from './useLeaderboard';

// "Ends in 2d 8h · 13 players ranked" while the week runs (ticking), "Final standings · …" after.
export function StatusLine ({ board }: { board: Leaderboard })
{
    const [now, setNow] = useState(() => Date.now());
    useEffect(() =>
    {
        if (board.final)
        {
            return;
        }
        const tick = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(tick);
    }, [board.final]);

    return (
        <p className="text-xs text-[#bba595]" aria-live="polite">
            {board.final ? 'Final standings' : timeLeftText(board.season.endsAt, now)} · {playersText(board.players)}
        </p>
    );
}
