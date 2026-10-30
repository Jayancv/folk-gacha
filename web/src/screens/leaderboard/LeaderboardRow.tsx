import { medal } from './leaderboardText';
import type { Leaderboard } from './useLeaderboard';

type Entry = Leaderboard['top'][number];

// One ranked player: rank (with a medal for the top 3), name, points. `mine` highlights the viewer.
export function LeaderboardRow ({ entry, mine, onOpen }: { entry: Entry; mine: boolean; onOpen: () => void })
{
    const color = medal(entry.rank);
    return (
        <li aria-current={mine ? 'true' : undefined}>
            <button
                onClick={onOpen}
                aria-label={`${entry.username}, rank ${entry.rank}, ${entry.points} points. Open profile`}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm active:bg-white/10 ${mine ? 'bg-[#e7b54a]/15 ring-1 ring-[#e7b54a]/60' : 'bg-white/[0.03]'}`}
            >
                <span
                    className="grid h-7 w-9 shrink-0 place-items-center rounded-md text-xs font-bold"
                    style={color ? { background: color, color: '#170e10' } : { color: '#bba595' }}
                >
                    {entry.rank}
                </span>
                <span className="mr-auto truncate font-bold">
                    {entry.username}
                    {mine && <span className="ml-1.5 text-xs font-normal text-[#e7b54a]">you</span>}
                </span>
                <span className="tabular-nums">{entry.points}</span>
            </button>
        </li>
    );
}
