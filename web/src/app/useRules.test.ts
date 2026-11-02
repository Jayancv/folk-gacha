import { describe, expect, it } from 'vitest';
import yaml from '../../../server/rules/game.yaml?raw';
import { DEFAULT_RULES } from './useRules';

// The fallback shown before GET /rules answers should match the server's game.yaml.
const value = (key: string) => Number(new RegExp(`^\\s*${key}:\\s*(\\d+)`, 'm').exec(yaml)?.[1]);

describe('DEFAULT_RULES', () =>
{
    it('matches server/rules/game.yaml (update both when you change one)', () =>
    {
        expect(DEFAULT_RULES).toEqual({
            maxTradeCards: value('maxCardsPerSide'),
            dailyOfferLimit: value('dailyOfferLimit'),
            offerExpiryHours: value('offerExpiryHours'),
            newAccountWaitDays: value('newAccountWaitDays'),
            partnerGiftsPerWeek: value('perWeek')
        });
    });
});
