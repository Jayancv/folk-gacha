export type Week = 'current' | 'previous';

const LABEL: Record<Week, string> = { current: 'This week', previous: 'Last week' };

// Switches the leaderboard between this week and last week.
export function WeekToggle ({ week, onChange, canGoBack }: { week: Week; onChange: (week: Week) => void; canGoBack: boolean })
{
    return (
        <div role="tablist" aria-label="Week" className="flex rounded-lg border border-[#3b2529] bg-[#22151a] p-0.5 text-sm">
            {(['current', 'previous'] as const).map(w => (
                <button
                    key={w}
                    role="tab"
                    aria-selected={week === w}
                    onClick={() => onChange(w)}
                    disabled={w === 'previous' && !canGoBack}
                    className={`rounded-md px-3 py-1.5 font-bold ${week === w ? 'bg-[#e7b54a] text-[#170e10]' : 'text-[#bba595]'}`}
                >
                    {LABEL[w]}
                </button>
            ))}
        </div>
    );
}
