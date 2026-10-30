import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { toCardData, type OwnedCard } from '../../api/cards';
import type { components } from '../../api/schema';
import { ApiRequestError } from '../../auth/useAuth';

type ApiProfile = components['schemas']['Profile'];

/** A profile with its showcase ready to draw. */
export type PlayerProfile = Omit<ApiProfile, 'showcase'> & { showcase: OwnedCard[] };

/** Query key prefix for profiles; claims and merges change stats and best cards. */
export const PROFILE_KEY = ['profile'] as const;

const key = (username: string) => [...PROFILE_KEY, username.toLowerCase()];

function toProfile (p: ApiProfile): PlayerProfile
{
    return { ...p, showcase: p.showcase.map(c => toCardData(c)) };
}

/** A player's profile (GET /users/{username}). */
export function useProfile (username: string)
{
    return useQuery({
        queryKey: key(username),
        queryFn: async ({ signal }) =>
        {
            const { data, error, response } = await api.GET('/users/{username}', { params: { path: { username } }, signal });
            if (!data)
            {
                throw new ApiRequestError(response.status, error?.error ?? 'unknown', error?.message);
            }
            return toProfile(data);
        },
        staleTime: 15_000,
        retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2
    });
}

/** Saves your showcase (PUT /me/showcase) and updates your profile with the answer. */
export function useSetShowcase (username: string)
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (cardIds: string[]) =>
        {
            const { data, error, response } = await api.PUT('/me/showcase', { body: { cardIds } });
            if (!data)
            {
                throw new ApiRequestError(response.status, error?.error ?? 'unknown', error?.message);
            }
            return toProfile(data);
        },
        onSuccess: profile => qc.setQueryData(key(username), profile)
    });
}
