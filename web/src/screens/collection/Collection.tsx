import { useEffect, useRef, useState } from 'react';
import type { OwnedCard } from '../../api/cards';
import { ELEMENT_STYLE, RARITIES, RARITY_STYLE } from '../../game/cards/model';
import { InTradeBadge } from '../trades/InTradeBadge';
import { pairGroups } from './mergeModel';
import { CardImage } from './CardImage';
import { CardSheet } from './CardSheet';
import {
    activeFilterCount,
    clearFilters,
    countText,
    ELEMENT_LABEL,
    ELEMENTS,
    emptyText,
    LEVELS,
    NO_FILTERS,
    SORTS,
    toggleElement,
    toggleLevel,
    toggleRarity,
    type CollectionFilters
} from './filters';
import { useCollection } from './useCollection';

// The player's cards from GET /cards, with filters: the List view of the Cards tab. Plain React
// (no Phaser); the table stays mounted underneath, asleep, while this covers it. `viewSwitch` is
// the Board / List switch; `onMerge` opens the Board on a card (the sheet's Merge button).
export function Collection ({ viewSwitch, onMerge }: { viewSwitch: React.ReactNode; onMerge: (card: OwnedCard) => void })
{
    const [filters, setFilters] = useState<CollectionFilters>(NO_FILTERS);
    const [showFilters, setShowFilters] = useState(false);
    const [open, setOpen] = useState<OwnedCard | null>(null);
    const cards = useCollection(filters);

    const list = cards.data?.pages.flatMap(p => p.cards) ?? [];
    const total = cards.data?.pages[0]?.total ?? 0;
    const filterCount = activeFilterCount(filters);
    // Cards that can level up with another loaded card get a "×n" mark.
    const pairs = pairGroups(list);

    // Load the next page when the end of the grid scrolls into view.
    const end = useRef<HTMLDivElement>(null);
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = cards;
    useEffect(() =>
    {
        const el = end.current;
        if (!el || !hasNextPage)
        {
            return;
        }
        const seen = new IntersectionObserver(entries =>
        {
            if (entries.some(e => e.isIntersecting) && !isFetchingNextPage)
            {
                void fetchNextPage();
            }
        }, { root: el.closest('[data-scroll-root]'), rootMargin: '800px 0px' });
        seen.observe(el);
        return () => seen.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // The card sheet sits outside the section: the section is a z-0 layer, so anything
    // inside it (even fixed z-50) would paint under the tab bar.
    return (
        <>
        <section data-scroll-root className="absolute inset-0 z-0 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label="Collection">
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-12 pb-3 backdrop-blur">
                <h1 className="sr-only">Collection</h1>
                <div className="mx-auto flex max-w-3xl items-center gap-2">
                    <div className="mr-auto">{viewSwitch}</div>
                    <label className="sr-only" htmlFor="collection-sort">Sort</label>
                    <select
                        id="collection-sort"
                        value={filters.sort}
                        onChange={e => setFilters({ ...filters, sort: e.target.value as CollectionFilters['sort'] })}
                        className="rounded-lg border border-[#3b2529] bg-[#22151a] px-2 py-2 text-sm"
                    >
                        {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        aria-expanded={showFilters}
                        aria-controls="collection-filters"
                        className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            filterCount > 0 ? 'border-[#e7b54a] text-[#e7b54a]' : 'border-[#3b2529] text-[#bba595]'
                        }`}
                    >
                        Filters{filterCount > 0 ? ` · ${filterCount}` : ''}
                    </button>
                </div>

                <p className="mx-auto mt-2 max-w-3xl text-xs text-[#bba595]" aria-live="polite">
                    {cards.isPending ? 'Loading…' : countText(total, filters)}
                </p>

                {showFilters && (
                    <div id="collection-filters" className="mx-auto mt-3 flex max-w-3xl flex-col gap-2">
                        <ChipRow label="Rarity">
                            {RARITIES.map(r => (
                                <Chip key={r} on={filters.rarities.includes(r)} color={RARITY_STYLE[r].color} onClick={() => setFilters(toggleRarity(filters, r))}>
                                    {RARITY_STYLE[r].label}
                                </Chip>
                            ))}
                        </ChipRow>
                        <ChipRow label="Element">
                            {ELEMENTS.map(e => (
                                <Chip key={e} on={filters.elements.includes(e)} color={ELEMENT_STYLE[e].badge} onClick={() => setFilters(toggleElement(filters, e))}>
                                    {ELEMENT_LABEL[e]}
                                </Chip>
                            ))}
                        </ChipRow>
                        <ChipRow label="Level">
                            {LEVELS.map(l => (
                                <Chip key={l} on={filters.level === l} color="#e7b54a" onClick={() => setFilters(toggleLevel(filters, l))}>
                                    {'★'.repeat(l)}
                                </Chip>
                            ))}
                        </ChipRow>
                        {filterCount > 0 && (
                            <button onClick={() => setFilters(clearFilters(filters))} className="self-start text-xs text-[#e7b54a] underline">
                                Clear filters
                            </button>
                        )}
                    </div>
                )}
            </header>

            <div className="mx-auto max-w-3xl px-4 pt-3 pb-32">
                {cards.isError && list.length === 0 ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">
                        Couldn't load your cards.{' '}
                        <button className="text-[#e7b54a] underline" onClick={() => void cards.refetch()}>Retry</button>
                    </p>
                ) : !cards.isPending && list.length === 0 ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">{emptyText(filters)}</p>
                ) : (
                    <ul className={`grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 ${cards.isPlaceholderData ? 'opacity-60' : ''}`}>
                        {list.map(card => (
                            <li key={card.id}>
                                <button
                                    onClick={() => setOpen(card)}
                                    className="relative block w-full rounded-[6%] transition-transform active:scale-95"
                                    aria-label={`${card.name}, level ${card.level}${card.inTrade ? ', in an open trade' : card.inTournament ? ', in a tournament' : pairs.has(card.id) ? ', can merge' : ''}`}
                                >
                                    <CardImage card={card} />
                                    {pairs.has(card.id) && (
                                        <span className="absolute -top-1.5 -left-1.5 rounded-full border border-[#170e10] bg-[#e7b54a] px-1.5 py-0.5 text-[10px] leading-none font-bold text-[#170e10] shadow" aria-hidden="true">
                                            ✦ ×{pairs.get(card.id)}
                                        </span>
                                    )}
                                    {card.inTrade && <InTradeBadge />}
                                    {card.inTournament && <InTradeBadge text="In event" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div ref={end} />
                {isFetchingNextPage && <p className="py-4 text-center text-xs text-[#bba595]">Loading more…</p>}
            </div>
        </section>
        {open && (
            <CardSheet
                card={open}
                onClose={() => setOpen(null)}
                onMerge={card =>
                {
                    setOpen(null);
                    onMerge(card);
                }}
            />
        )}
        </>
    );
}

function ChipRow ({ label, children }: { label: string; children: React.ReactNode })
{
    return (
        <div role="group" aria-label={label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-[#bba595]">{label}</span>
            {/* Scrolls sideways on narrow phones instead of wrapping into a tall block. */}
            <div className="-mr-4 flex gap-1.5 overflow-x-auto pr-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
        </div>
    );
}

function Chip ({ on, color, onClick, children }: { on: boolean; color: string; onClick: () => void; children: React.ReactNode })
{
    return (
        <button
            onClick={onClick}
            aria-pressed={on}
            style={on ? { borderColor: color, color: '#170e10', background: color } : { borderColor: `${color}66`, color }}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap active:scale-95"
        >
            {children}
        </button>
    );
}
