import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { OwnedCard } from '../../api/cards';
import { MAX_LEVEL } from '../../game/cards/model';
import { CARDS_KEY } from './useCollection';

/**
 * How many of your other cards share this card's spirit and level (its level-up partners), for
 * the sheet's Merge button. Under CARDS_KEY, so claims, merges and trades refresh it.
 * Undefined while loading, and for cards that can't level up or merge right now.
 */
export function useMergeMatches (card: OwnedCard, enabled: boolean): number | undefined
{
    const query = useQuery({
        queryKey: [...CARDS_KEY, 'matches', card.templateId, card.level],
        queryFn: async ({ signal }) =>
        {
            const { data } = await api.GET('/cards', { params: { query: { spirit: card.templateId, level: card.level, limit: 1 } }, signal });
            if (!data)
            {
                throw new Error('GET /cards failed');
            }
            return data.total;
        },
        enabled: enabled && card.level < MAX_LEVEL && !card.inTrade && !card.inTournament,
        staleTime: 30_000
    });
    // The card itself is one of them.
    return query.data === undefined ? undefined : Math.max(0, query.data - 1);
}
