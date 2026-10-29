import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { forgetGoogleAccount } from './googleIdentity';

export type Me = components['schemas']['Me'];
export type AuthConfig = components['schemas']['AuthConfig'];
type ApiError = components['schemas']['Error'];

const ME_KEY = ['me'] as const;

/** Thrown for API errors so TanStack Query treats them as failures. */
export class ApiRequestError extends Error
{
    constructor (readonly status: number, readonly code: string, message?: string)
    {
        super(message ?? code);
    }
}

function fail (status: number, error: ApiError | undefined): never
{
    throw new ApiRequestError(status, error?.error ?? 'unknown', error?.message);
}

/** Which sign-in options the server offers. */
export function useAuthConfig ()
{
    return useQuery({
        queryKey: ['auth-config'],
        queryFn: async () =>
        {
            const { data, response } = await api.GET('/auth/config');
            if (!data)
            {
                throw new ApiRequestError(response.status, 'unavailable');
            }
            return data;
        },
        staleTime: Infinity
    });
}

/** The signed-in player, or null when signed out. Errors mean the API is unreachable. */
export function useMe ()
{
    return useQuery({
        queryKey: ME_KEY,
        queryFn: async (): Promise<Me | null> =>
        {
            const { data, error, response } = await api.GET('/me');
            if (response.status === 401)
            {
                return null;
            }
            return data ?? fail(response.status, error);
        },
        // Not signed in is an answer, not a failure: don't retry 401s.
        retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2
    });
}

function useSignedIn ()
{
    const qc = useQueryClient();
    return (me: Me) => qc.setQueryData(ME_KEY, me);
}

export function useGoogleSignIn ()
{
    const signedIn = useSignedIn();
    return useMutation({
        mutationFn: async (credential: string) =>
        {
            const { data, error, response } = await api.POST('/auth/google', { body: { credential } });
            return data ?? fail(response.status, error);
        },
        onSuccess: signedIn
    });
}

export function useDevSignIn ()
{
    const signedIn = useSignedIn();
    return useMutation({
        mutationFn: async (name: string) =>
        {
            const { data, error, response } = await api.POST('/auth/dev', { body: { name } });
            return data ?? fail(response.status, error);
        },
        onSuccess: signedIn
    });
}

export function useSignOut ()
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () =>
        {
            await api.POST('/auth/logout');
        },
        onSettled: () =>
        {
            forgetGoogleAccount();
            // Show the sign-in screen, and drop everything cached for this player.
            // (Not qc.clear(): that would detach the screen watching `me`.)
            qc.setQueryData(ME_KEY, null);
            qc.removeQueries({ predicate: q => q.queryKey[0] !== ME_KEY[0] && q.queryKey[0] !== 'auth-config' });
        }
    });
}

/** A short message for a failed sign-in. */
export function signInErrorText (err: unknown): string
{
    if (err instanceof ApiRequestError)
    {
        switch (err.code)
        {
            case 'invalid_token': return 'Google sign-in failed. Please try again.';
            case 'bad_name': return err.message;
            case 'google_disabled':
            case 'dev_login_disabled': return 'That sign-in option is turned off on this server.';
        }
        if (err.status >= 500)
        {
            return 'The server is having trouble. Try again in a moment.';
        }
    }
    return 'Could not reach the server. Check your connection.';
}
