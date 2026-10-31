import { describe, expect, it } from 'vitest';
import type { ApiCard } from '../../api/cards';
import {
    expiresText,
    groupTrades,
    hoursText,
    historyText,
    pickCountText,
    statusText,
    toTradeView,
    tradeErrorText,
    tradeUnlockText,
    waitingCount,
    whenText,
    type ApiTrade,
    type TradeView
} from './tradeModel';

const card = (id: string): ApiCard => ({
    id,
    seasonCardId: 's1-0042',
    cardSeasonId: 's1',
    setNo: 42,
    setSize: 1500,
    copyNo: 3,
    templateId: 'gaja-calf',
    name: 'Moonlit Gaja Calf',
    title: 'Gaja Calf',
    epithet: 'Moonlit',
    nameSi: 'ඇත් පැටියා',
    element: 'earth',
    rarity: 'common',
    level: 1,
    score: 11,
    lore: '',
    traits: { prefix: 'moonlit', intensity: 1, adverb: '', suffix: 'none', pattern: 'thorana', palette: 'sunset', stamp: 'none', foil: 'none', visual: { effect: 'moonglow' } },
    artSeed: 1,
    acquiredVia: 'pack',
    acquiredAt: '2026-10-30T12:00:00Z',
    inTrade: false
});

const trade = (over: Partial<ApiTrade> = {}): ApiTrade => ({
    id: 't1',
    direction: 'incoming',
    from: 'asha',
    to: 'ben',
    status: 'open',
    createdAt: '2026-11-04T10:00:00Z',
    expiresAt: '2026-11-06T10:00:00Z',
    // Asha gives a1; she asks for b1 (and b2, which was merged away).
    offer: [{ cardId: 'a1', card: card('a1') }],
    request: [{ cardId: 'b1', card: card('b1') }, { cardId: 'b2' }],
    gifted: false,
    ...over
});

const ids = (cards: TradeView['youGive']) => cards.map(c => c.cardId);

describe('toTradeView', () =>
{
    it('sees an incoming offer from the recipient: you give what they asked for', () =>
    {
        const t = toTradeView(trade());
        expect(t).toMatchObject({ incoming: true, partner: 'asha' });
        expect(ids(t.youGive)).toEqual(['b1', 'b2']);
        expect(ids(t.youGet)).toEqual(['a1']);
        expect(t.youGive[1].card).toBeUndefined(); // gone cards stay listed without a face
    });

    it('sees an outgoing offer from the sender', () =>
    {
        const t = toTradeView(trade({ direction: 'outgoing' }));
        expect(t).toMatchObject({ incoming: false, partner: 'ben' });
        expect(ids(t.youGive)).toEqual(['a1']);
        expect(ids(t.youGet)).toEqual(['b1', 'b2']);
    });

    it('says whether you got a partner gift', () =>
    {
        expect(toTradeView(trade({ status: 'accepted', gifted: true })).gifted).toBe(true);
        expect(toTradeView(trade()).gifted).toBe(false);
    });
});

describe('the inbox', () =>
{
    const list = [
        trade({ id: 'in' }),
        trade({ id: 'out', direction: 'outgoing' }),
        trade({ id: 'done', status: 'accepted', resolvedAt: '2026-11-04T11:00:00Z' }),
        trade({ id: 'in2' })
    ].map(t => toTradeView(t));

    it('groups waiting, sent and resolved offers, keeping their order', () =>
    {
        const g = groupTrades(list);
        expect(g.incoming.map(t => t.id)).toEqual(['in', 'in2']);
        expect(g.sent.map(t => t.id)).toEqual(['out']);
        expect(g.history.map(t => t.id)).toEqual(['done']);
    });

    it('badges only offers waiting for your answer', () =>
    {
        expect(waitingCount(list)).toBe(2);
    });
});

describe('text', () =>
{
    const now = Date.parse('2026-11-04T10:00:00Z');
    it('counts down to expiry', () =>
    {
        expect(expiresText('2026-11-06T10:00:00Z', now)).toBe('Expires in 2 d');
        expect(expiresText('2026-11-04T15:30:00Z', now)).toBe('Expires in 5 h');
        expect(expiresText('2026-11-04T10:12:30Z', now)).toBe('Expires in 12 min');
        expect(expiresText('2026-11-04T10:00:20Z', now)).toBe('Expiring now');
    });

    it('says what happened, from your side', () =>
    {
        expect(statusText({ status: 'declined', incoming: false, partner: 'ben' })).toBe('ben declined');
        expect(statusText({ status: 'declined', incoming: true, partner: 'asha' })).toBe("You declined asha's offer");
        expect(statusText({ status: 'cancelled', incoming: true, partner: 'asha' })).toBe('asha withdrew the offer');
        expect(statusText({ status: 'accepted', incoming: true, partner: 'asha' })).toBe('Traded with asha');
        expect(statusText({ status: 'open', incoming: false, partner: 'ben' })).toBe('Waiting for ben');
    });

    it('sums up past offers in one line, without their cards', () =>
    {
        const done = toTradeView(trade({ status: 'accepted', gifted: true, resolvedAt: '2026-11-03T22:00:00Z' }));
        expect(historyText(done, now)).toBe('Traded with asha · 2 for 1 · gift · yesterday');
        const declined = toTradeView(trade({ direction: 'outgoing', status: 'declined', resolvedAt: '2026-11-04T09:00:00Z' }));
        expect(historyText(declined, now)).toBe('ben declined · today');
        expect(whenText('2026-11-01T12:00:00Z', now)).toBe('3 days ago');
    });

    it('says when a new account can trade', () =>
    {
        expect(tradeUnlockText('2026-11-04T09:00:00Z', now)).toBeNull();
        expect(tradeUnlockText('2026-11-04T10:00:00Z', now)).toBeNull();
        expect(tradeUnlockText('2026-11-05T09:00:00Z', now, 'en-GB')).toBe('Trading unlocks tomorrow (5 Nov). New accounts wait a week.');
        expect(tradeUnlockText('2026-11-09T09:00:00Z', now, 'en-GB')).toBe('Trading unlocks in 5 days (9 Nov). New accounts wait a week.');
    });

    it("prefers the server's message for errors", () =>
    {
        expect(tradeErrorText('in_trade', 'One of these cards is already in an open offer.')).toBe('One of these cards is already in an open offer.');
        expect(tradeErrorText('network')).toMatch(/connection/);
        expect(tradeErrorText('weird')).toBe('Something went wrong. Try again.');
    });

    it('counts picks', () =>
    {
        expect(pickCountText(0, 5)).toBe('Pick 1 to 5 cards');
        expect(pickCountText(2, 3)).toBe('2 of 3 picked');
        expect(hoursText(48)).toBe('48 hours');
        expect(hoursText(1)).toBe('1 hour');
    });
});
