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
    partnerGiftsPerWeek: 2,
    dropChancePercent: { common: 70, uncommon: 20, rare: 8, epic: 1.8, legendary: 0.2 },
    pityPacks: 7,
    maxUnopenedCards: 15
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
    // An older server may not send every field yet (the web app can deploy first): fill in the defaults.
    return rules.data ? { ...DEFAULT_RULES, ...rules.data } : DEFAULT_RULES;
}
