import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { toCardData } from '../../api/cards';
import { useLiveConnected } from '../../app/live/liveStatus';
import { ApiRequestError, ME_KEY } from '../../auth/useAuth';
import { NO_FILTERS, toQuery } from '../collection/filters';
import { CARDS_KEY } from '../collection/useCollection';
import { PROFILE_KEY } from '../profile/useProfile';
import { toTradeView, TRADES_POLL_MS, type TradeView } from './tradeModel';

/** Query key for your offers; trades change cards, so invalidate CARDS_KEY with it. */
export const TRADES_KEY = ['trades'] as const;

/** Thrown for a failed request; `code` is the server's error code (or 'network'). */
function fail (status: number, error?: { error: string; message?: string }): never
{
    throw new ApiRequestError(status, error?.error ?? 'unknown', error?.message);
}

/** Your open offers and the last week's, newest first (GET /trades). Polls only while the live socket is down. */
export function useTrades ()
{
    const live = useLiveConnected();
    return useQuery({
        queryKey: TRADES_KEY,
        queryFn: async ({ signal }): Promise<TradeView[]> =>
        {
            const { data, error, response } = await api.GET('/trades', { signal });
            if (!data)
            {
                fail(response.status, error);
            }
            return data.trades.map(t => toTradeView(t));
        },
        refetchInterval: live ? false : TRADES_POLL_MS,
        staleTime: 5_000
    });
}

export type TradeAction = 'accept' | 'decline' | 'cancel';

/** Accept, decline or cancel an offer. Every outcome can move or unlock cards. */
export function useTradeAction ()
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: TradeAction }): Promise<TradeView> =>
        {
            const params = { params: { path: { tradeId: id } } };
            const { data, error, response } = action === 'accept'
                ? await api.POST('/trades/{tradeId}/accept', params)
                : action === 'decline'
                    ? await api.POST('/trades/{tradeId}/decline', params)
                    : await api.POST('/trades/{tradeId}/cancel', params);
            if (!data)
            {
                fail(response.status, error);
            }
            return toTradeView(data);
        },
        onSettled: () => refreshAfterTrade(qc)
    });
}

/** Sends an offer (POST /trades). */
export function useCreateTrade ()
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: { to: string; offer: string[]; request: string[] }): Promise<TradeView> =>
        {
            const { data, error, response } = await api.POST('/trades', { body });
            if (!data)
            {
                fail(response.status, error);
            }
            return toTradeView(data);
        },
        onSuccess: () => refreshAfterTrade(qc)
    });
}

/** After any trade change: offers, cards (owners and in-trade locks), profiles and others' cards. */
export function refreshAfterTrade (qc: ReturnType<typeof useQueryClient>)
{
    void qc.invalidateQueries({ queryKey: TRADES_KEY });
    void qc.invalidateQueries({ queryKey: CARDS_KEY }); // owners and in-trade locks changed
    void qc.invalidateQueries({ queryKey: PROFILE_KEY }); // card counts and best cards
    void qc.invalidateQueries({ queryKey: PLAYER_CARDS_KEY });
    void qc.invalidateQueries({ queryKey: ME_KEY }); // a first trade with someone leaves a gift on the Pack tab
}

const PLAYER_CARDS_KEY = ['player-cards'] as const;

/** Another player's cards, best first, to pick what to ask for (GET /users/{username}/cards). */
export function usePlayerCards (username: string)
{
    const filters = { ...NO_FILTERS, sort: 'score' as const };
    return useInfiniteQuery({
        queryKey: [...PLAYER_CARDS_KEY, username.toLowerCase()],
        queryFn: async ({ pageParam, signal }) =>
        {
            const { data, error, response } = await api.GET('/users/{username}/cards', {
                params: { path: { username }, query: toQuery(filters, pageParam) },
                signal
            });
            if (!data)
            {
                fail(response.status, error);
            }
            return { total: data.total, nextOffset: data.nextOffset, cards: data.cards.map(c => toCardData(c)) };
        },
        initialPageParam: 0,
        getNextPageParam: last => last.nextOffset,
        placeholderData: keepPreviousData
    });
}

/** The error code and text of a failed trade request. */
export function errorOf (err: unknown): { code: string; message?: string }
{
    if (err instanceof ApiRequestError)
    {
        // Without a server message, an ApiRequestError's message is its code.
        return { code: err.code, message: err.message !== err.code ? err.message : undefined };
    }
    return { code: 'network' };
}
