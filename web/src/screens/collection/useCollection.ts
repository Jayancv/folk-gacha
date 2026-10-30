import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { toCardData } from '../../api/cards';
import { ApiRequestError } from '../../auth/useAuth';
import { toQuery, type CollectionFilters } from './filters';

/** Query key prefix for the collection; invalidate it after claims and merges. */
export const CARDS_KEY = ['cards'] as const;

/** The player's cards for these filters, a page at a time (GET /cards). */
export function useCollection (filters: CollectionFilters)
{
    return useInfiniteQuery({
        queryKey: [...CARDS_KEY, toQuery(filters)],
        queryFn: async ({ pageParam, signal }) =>
        {
            const { data, error, response } = await api.GET('/cards', { params: { query: toQuery(filters, pageParam) }, signal });
            if (!data)
            {
                throw new ApiRequestError(response.status, error?.error ?? 'unknown', error?.message);
            }
            return { total: data.total, nextOffset: data.nextOffset, cards: data.cards.map(c => toCardData(c)) };
        },
        initialPageParam: 0,
        getNextPageParam: last => last.nextOffset,
        // Keep showing the old cards while a new filter loads, instead of flashing empty.
        placeholderData: keepPreviousData
    });
}
