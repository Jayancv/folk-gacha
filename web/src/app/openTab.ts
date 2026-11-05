// Notifications open the app on a tab: "/?tab=trades" (server/internal/push TradesURL).
import type { Tab } from './useTabs';

const TABS: Record<string, Tab> = { trades: 'Trades', tournaments: 'Tournaments', ranks: 'Leaderboard', pack: 'PackOpen' };

/** The tab a link asks for (?tab=trades), or null. */
export function tabFromUrl (href: string): Tab | null
{
    try
    {
        return TABS[new URL(href, 'https://app.invalid').searchParams.get('tab') ?? ''] ?? null;
    }
    catch
    {
        return null;
    }
}
