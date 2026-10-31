import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { components } from '../api/schema';

export type GameRules = components['schemas']['GameRules'];

/** Until GET /rules answers (and if it can't): the values in server/rules/game.yaml at the time of writing. */
export const DEFAULT_RULES: GameRules = {
    maxTradeCards: 5,
    dailyOfferLimit: 5,
    offerExpiryHours: 48,
    newAccountWaitDays: 0,
    partnerGiftsPerWeek: 2
};

/** The game's tunable limits (GET /rules), loaded once per session. */
export function useRules (): GameRules
{
    const rules = useQuery({
        queryKey: ['rules'],
        queryFn: async ({ signal }) =>
        {
            const { data } = await api.GET('/rules', { signal });
            if (!data)
            {
                throw new Error('GET /rules failed');
            }
            return data;
        },
        staleTime: Infinity
    });
    return rules.data ?? DEFAULT_RULES;
}
