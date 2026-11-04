import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { cardsChanged } from '../../app/cardsChanged';
import { ApiRequestError } from '../../auth/useAuth';
import { CARDS_KEY } from '../collection/useCollection';
import { PROFILE_KEY } from '../profile/useProfile';
import { TOURNAMENTS_POLL_MS, type LineupScore, type Tournament, type TournamentDetail, type TournamentEntry } from './tournamentModel';

/** Query key for the list and every tournament's detail. */
export const TOURNAMENTS_KEY = ['tournaments'] as const;

function fail (status: number, error?: { error: string; message?: string }): never
{
    throw new ApiRequestError(status, error?.error ?? 'unknown', error?.message);
}

/** Running, recent and next tournaments (GET /tournaments). */
export function useTournaments ()
{
    return useQuery({
        queryKey: TOURNAMENTS_KEY,
        queryFn: async ({ signal }): Promise<{ tournaments: Tournament[]; upcoming: Tournament[] }> =>
        {
            const { data, error, response } = await api.GET('/tournaments', { signal });
            if (!data)
            {
                fail(response.status, error);
            }
            return data;
        },
        refetchInterval: TOURNAMENTS_POLL_MS,
        staleTime: 15_000
    });
}

/** One tournament with your entry and, once closed, the results (GET /tournaments/{id}). */
export function useTournament (id: string)
{
    return useQuery({
        queryKey: [...TOURNAMENTS_KEY, id],
        queryFn: async ({ signal }): Promise<TournamentDetail> =>
        {
            const { data, error, response } = await api.GET('/tournaments/{tournamentId}', { params: { path: { tournamentId: id } }, signal });
            if (!data)
            {
                fail(response.status, error);
            }
            return data;
        },
        refetchInterval: TOURNAMENTS_POLL_MS,
        staleTime: 10_000
    });
}

/**
 * The server's score for a lineup (POST …/preview), while it's full. The app never
 * scores lineups itself.
 */
export function useLineupPreview (id: string, cardIds: readonly string[], ready: boolean)
{
    return useQuery({
        queryKey: [...TOURNAMENTS_KEY, id, 'preview', ...cardIds],
        enabled: ready,
        queryFn: async ({ signal }): Promise<LineupScore> =>
        {
            const { data, error, response } = await api.POST('/tournaments/{tournamentId}/preview', {
                params: { path: { tournamentId: id } }, body: { cardIds: [...cardIds] }, signal
            });
            if (!data)
            {
                fail(response.status, error);
            }
            return data;
        },
        placeholderData: keepPreviousData,
        retry: false,
        staleTime: 30_000
    });
}

/** Saves your lineup (PUT …/entry): the cards are locked in the tournament. */
export function useEnterTournament (id: string)
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (cardIds: string[]): Promise<TournamentEntry> =>
        {
            const { data, error, response } = await api.PUT('/tournaments/{tournamentId}/entry', {
                params: { path: { tournamentId: id } }, body: { cardIds }
            });
            if (!data)
            {
                fail(response.status, error);
            }
            return data;
        },
        onSettled: () => refreshAfterEntry(qc)
    });
}

/** Withdraws your entry (DELETE …/entry): its cards are free again. */
export function useWithdrawFromTournament (id: string)
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (): Promise<void> =>
        {
            const { error, response } = await api.DELETE('/tournaments/{tournamentId}/entry', { params: { path: { tournamentId: id } } });
            if (!response.ok)
            {
                fail(response.status, error);
            }
        },
        onSettled: () => refreshAfterEntry(qc)
    });
}

/** After entering or withdrawing: tournaments, and cards (their locks changed). */
function refreshAfterEntry (qc: ReturnType<typeof useQueryClient>)
{
    void qc.invalidateQueries({ queryKey: TOURNAMENTS_KEY });
    void qc.invalidateQueries({ queryKey: CARDS_KEY });
    void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    cardsChanged(); // the Board lays out its own copy of the cards (lock badges)
}
