import type { Tab } from './useTabs';

const TABS: { tab: Tab; label: string; icon: string }[] = [
    { tab: 'PackOpen', label: 'Pack', icon: 'M4 7h16v12H4zM7 4h10v3H7z' },
    { tab: 'MergeBoard', label: 'Board', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
    { tab: 'Collection', label: 'Cards', icon: 'M8 3h11v15H8zM5 6v15h11' },
    { tab: 'Trades', label: 'Trades', icon: 'M4 8h14l-4-4M20 16H6l4 4' },
    { tab: 'Leaderboard', label: 'Ranks', icon: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8' }
];

// The bottom navigation between the table scenes and the React screens. `badges`: counts to
// flag on tabs (offers waiting for you on Trades).
export function TabBar ({ tab, onSwitch, badges = {} }: { tab: Tab; onSwitch: (tab: Tab) => void; badges?: Partial<Record<Tab, number>> })
{
    return (
        <nav className="pointer-events-auto flex gap-1 rounded-2xl border border-[#3b2529] bg-[#22151a]/90 p-1 shadow-lg backdrop-blur">
            {TABS.map(t => (
                <button
                    key={t.tab}
                    data-tutorial={`tab-${t.tab}`}
                    onClick={() => onSwitch(t.tab)}
                    aria-current={tab === t.tab ? 'page' : undefined}
                    className={`relative flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-xs font-bold tracking-wide ${
                        tab === t.tab ? 'bg-[#e7b54a] text-[#170e10]' : 'text-[#bba595] active:bg-white/5'
                    }`}
                >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d={t.icon} />
                    </svg>
                    {t.label}
                    {(badges[t.tab] ?? 0) > 0 && (
                        <span className="absolute top-1 right-2 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-bold text-white" aria-label={`${badges[t.tab]} waiting`}>
                            {badges[t.tab]}
                        </span>
                    )}
                </button>
            ))}
        </nav>
    );
}
