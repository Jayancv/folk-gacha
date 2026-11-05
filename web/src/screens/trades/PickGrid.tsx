import type { OwnedCard } from '../../api/cards';
import { CardImage } from '../collection/CardImage';
import { InTradeBadge } from './InTradeBadge';

/** The paged card list a picker shows (a TanStack infinite query). */
export interface PickQuery
{
    data?: { pages: { cards: OwnedCard[] }[] };
    isPending: boolean;
    isError: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
    refetch: () => Promise<unknown>;
}

interface Props
{
    query: PickQuery;
    /** Picked card ids, in pick order. */
    picked: string[];
    max: number;
    onPick: (card: OwnedCard) => void;
    empty: string;
    /** Why a card can't be picked (shown on it), or null. */
    blocked: (card: OwnedCard) => string | null;
    /** Shown under a card, e.g. its points in a preview. */
    note?: (card: OwnedCard) => string | null;
    /** Show the pick order (lineup slots) instead of a tick. */
    numbered?: boolean;
}

// A grid of cards to pick up to `max` from (trades, tournament lineups). Picking only
// collects ids; the server checks everything again.
export function PickGrid ({ query, picked, max, onPick, empty, blocked, note, numbered = false }: Props)
{
    const list = query.data?.pages.flatMap(p => p.cards) ?? [];
    if (query.isPending)
    {
        return <p className="py-16 text-center text-sm text-[#bba595]">Loading cards…</p>;
    }
    if (query.isError && list.length === 0)
    {
        return (
            <p className="py-16 text-center text-sm text-[#bba595]">
                Couldn't load the cards. <button className="text-[#e7b54a] underline" onClick={() => void query.refetch()}>Retry</button>
            </p>
        );
    }
    if (list.length === 0)
    {
        return <p className="py-16 text-center text-sm text-[#bba595]">{empty}</p>;
    }
    return (
        <>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {list.map(card =>
                {
                    const at = picked.indexOf(card.id);
                    const full = picked.length >= max && at < 0;
                    const why = blocked(card);
                    const under = note?.(card);
                    return (
                        <li key={card.id}>
                            <button
                                onClick={() => onPick(card)}
                                disabled={why !== null}
                                aria-pressed={at >= 0}
                                aria-label={`${card.name}, level ${card.level}${why ? `, ${why.toLowerCase()}` : ''}`}
                                className={`relative block w-full rounded-[6%] transition ${at >= 0 ? 'ring-3 ring-[#e7b54a]' : ''} ${full || why ? 'opacity-45' : ''}`}
                            >
                                <CardImage card={card} />
                                {why && <InTradeBadge text={why} />}
                                {at >= 0 && (
                                    <span className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-[#e7b54a] text-sm font-bold text-[#170e10] shadow">
                                        {numbered ? at + 1 : '✓'}
                                    </span>
                                )}
                            </button>
                            {under && <p className="mt-0.5 text-center text-[11px] font-bold text-[#e7b54a]">{under}</p>}
                        </li>
                    );
                })}
            </ul>
            {query.hasNextPage && (
                <button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="mx-auto mt-4 block text-sm text-[#e7b54a] underline">
                    {query.isFetchingNextPage ? 'Loading…' : 'Show more cards'}
                </button>
            )}
        </>
    );
}
