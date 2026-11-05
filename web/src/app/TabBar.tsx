import { navOf, type NavTab } from './cardsView';
import type { Tab } from './useTabs';

const TABS: { nav: NavTab; label: string; icon: string }[] = [
    { nav: 'PackOpen', label: 'Pack', icon: 'M4 7h16v12H4zM7 4h10v3H7z' },
    { nav: 'Cards', label: 'Cards', icon: 'M8 3h11v15H8zM5 6v15h11' },
    { nav: 'Trades', label: 'Trades', icon: 'M4 8h14l-4-4M20 16H6l4 4' },
    { nav: 'Tournaments', label: 'Tournament', icon: 'M5 21V4M5 4h11l-2 4 2 4H5' },
    { nav: 'Leaderboard', label: 'Ranks', icon: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8' }
];

// The bottom navigation. Cards covers both its views (Board and List). `badges`: counts to flag
// on buttons (offers waiting for you on Trades, open tournaments you haven't entered on Tournament).
export function TabBar ({ tab, onSwitch, badges = {} }: { tab: Tab; onSwitch: (nav: NavTab) => void; badges?: Partial<Record<NavTab, number>> })
{
    const lit = navOf(tab);
    return (
        <nav className="pointer-events-auto flex gap-1 rounded-2xl border border-[#3b2529] bg-[#22151a]/90 p-1 shadow-lg backdrop-blur">
            {TABS.map(t => (
                <button
                    key={t.nav}
                    data-tutorial={`tab-${t.nav}`}
                    onClick={() => onSwitch(t.nav)}
                    aria-current={lit === t.nav ? 'page' : undefined}
                    className={`relative flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[11px] font-bold ${
                        lit === t.nav ? 'bg-[#e7b54a] text-[#170e10]' : 'text-[#bba595] active:bg-white/5'
                    }`}
                >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d={t.icon} />
                    </svg>
                    {t.label}
                    {(badges[t.nav] ?? 0) > 0 && (
                        <span className="absolute top-1 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-bold text-white" aria-label={`${badges[t.nav]} waiting`}>
                            {badges[t.nav]}
                        </span>
                    )}
                </button>
            ))}
        </nav>
    );
}
