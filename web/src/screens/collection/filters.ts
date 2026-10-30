// Collection filters as plain data, and how they map to GET /cards (no React here).

import type { CardSort } from '../../api/cards';
import { RARITIES, type Element, type Rarity } from '../../game/cards/model';

export const ELEMENTS: readonly Element[] = ['earth', 'fire', 'water', 'wind', 'forest'];
export const ELEMENT_LABEL: Record<Element, string> = { earth: 'Earth', fire: 'Fire', water: 'Water', wind: 'Wind', forest: 'Forest' };
export const LEVELS = [1, 2, 3, 4, 5] as const;

export const SORTS: { id: CardSort; label: string }[] = [
    { id: 'newest', label: 'Newest' },
    { id: 'score', label: 'Highest score' },
    { id: 'number', label: 'Set number' }
];

export const PAGE_SIZE = 60;

export interface CollectionFilters
{
    rarities: Rarity[];
    elements: Element[];
    /** null = any level */
    level: number | null;
    sort: CardSort;
}

export const NO_FILTERS: CollectionFilters = { rarities: [], elements: [], level: null, sort: 'newest' };

/** Adds or removes `value`, keeping the list in `order` so equal filters share a cache key. */
export function toggle<T> (list: readonly T[], value: T, order: readonly T[]): T[]
{
    const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
    return order.filter(v => next.includes(v));
}

export const toggleRarity = (f: CollectionFilters, r: Rarity): CollectionFilters =>
    ({ ...f, rarities: toggle(f.rarities, r, RARITIES) });

export const toggleElement = (f: CollectionFilters, e: Element): CollectionFilters =>
    ({ ...f, elements: toggle(f.elements, e, ELEMENTS) });

/** Tapping the selected level again clears it. */
export const toggleLevel = (f: CollectionFilters, level: number): CollectionFilters =>
    ({ ...f, level: f.level === level ? null : level });

/** How many filters narrow the list (sort doesn't count). */
export function activeFilterCount (f: CollectionFilters): number
{
    return f.rarities.length + f.elements.length + (f.level === null ? 0 : 1);
}

/** Clears the filters but keeps the sort. */
export const clearFilters = (f: CollectionFilters): CollectionFilters => ({ ...NO_FILTERS, sort: f.sort });

export interface CardsQuery
{
    rarity?: Rarity[];
    element?: Element[];
    level?: number;
    sort?: CardSort;
    limit: number;
    offset: number;
}

/** Query parameters for one page of GET /cards; unset filters are left out. */
export function toQuery (f: CollectionFilters, offset = 0, limit = PAGE_SIZE): CardsQuery
{
    const q: CardsQuery = { limit, offset };
    if (f.rarities.length > 0)
    {
        q.rarity = f.rarities;
    }
    if (f.elements.length > 0)
    {
        q.element = f.elements;
    }
    if (f.level !== null)
    {
        q.level = f.level;
    }
    if (f.sort !== 'newest')
    {
        q.sort = f.sort;
    }
    return q;
}

export function countText (total: number, f: CollectionFilters): string
{
    const cards = `${total} ${total === 1 ? 'card' : 'cards'}`;
    return activeFilterCount(f) > 0 ? `${cards} match` : cards;
}

export function emptyText (f: CollectionFilters): string
{
    return activeFilterCount(f) > 0
        ? 'No cards match these filters.'
        : 'No cards yet. Open your daily pack to start your collection.';
}
