import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { components } from '../../api/schema';
import { ApiRequestError } from '../../auth/useAuth';

export type Leaderboard = components['schemas']['Leaderboard'];

/** Query key prefix for leaderboards; invalidate it after claims and merges (points change). */
export const LEADERBOARD_KEY = ['leaderboard'] as const;

/** The current week's board, or a past week's by id (GET /leaderboard/...). Loads only while `enabled`. */
export function useLeaderboard (seasonId: 'current' | string, enabled = true)
{
    return useQuery({
        enabled,
        queryKey: [...LEADERBOARD_KEY, seasonId],
        queryFn: async ({ signal }): Promise<Leaderboard> =>
        {
            const { data, error, response } = seasonId === 'current'
                ? await api.GET('/leaderboard/current', { signal })
                : await api.GET('/leaderboard/{seasonId}', { params: { path: { seasonId } }, signal });
            if (!data)
            {
                throw new ApiRequestError(response.status, error?.error ?? 'unknown', error?.message);
            }
            return data;
        },
        // Ranks move as players claim and merge; refresh when the screen opens again.
        staleTime: 15_000,
        // A week without a board (404) won't appear by retrying; server errors might.
        retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2
    });
}
