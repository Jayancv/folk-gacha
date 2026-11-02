import { describe, expect, it } from 'vitest';
import { eventNotice, isTradeEvent, parseEvent, retryDelay, socketUrl } from './liveModel';

describe('parseEvent', () =>
{
    it('reads events and ignores anything else', () =>
    {
        expect(parseEvent('{"type":"trade.received","tradeId":"t1","by":"asha"}')).toEqual({ type: 'trade.received', tradeId: 't1', by: 'asha' });
        expect(parseEvent('{"type":"trade.expired","tradeId":"t1"}')).toEqual({ type: 'trade.expired', tradeId: 't1', by: undefined });
        expect(parseEvent('{"type":3}')).toBeNull();
        expect(parseEvent('not json')).toBeNull();
        expect(parseEvent(new ArrayBuffer(2))).toBeNull();
    });
});

describe('socketUrl', () =>
{
    const page = { protocol: 'https:', host: 'folk-gacha.netlify.app' };
    it('goes straight to VITE_WS_URL when set (production)', () =>
    {
        expect(socketUrl('a b', { wsUrl: 'wss://folk-gacha.onrender.com/ws' }, page)).toBe('wss://folk-gacha.onrender.com/ws?ticket=a%20b');
    });
    it('sits next to an absolute API URL', () =>
    {
        expect(socketUrl('t', { apiUrl: 'https://api.example.com/' }, page)).toBe('wss://api.example.com/ws?ticket=t');
        expect(socketUrl('t', { apiUrl: 'http://localhost:8081' }, page)).toBe('ws://localhost:8081/ws?ticket=t');
    });
    it("uses the page's own /api otherwise (the dev proxy)", () =>
    {
        expect(socketUrl('t', {}, { protocol: 'http:', host: 'localhost:8080' })).toBe('ws://localhost:8080/api/ws?ticket=t');
        expect(socketUrl('t', {}, page)).toBe('wss://folk-gacha.netlify.app/api/ws?ticket=t');
    });
});

describe('retryDelay', () =>
{
    it('doubles from 1 s up to 30 s, with jitter of ±25%', () =>
    {
        expect(retryDelay(0, () => 0.5)).toBe(1_000);
        expect(retryDelay(3, () => 0.5)).toBe(8_000);
        expect(retryDelay(10, () => 0.5)).toBe(30_000);
        expect(retryDelay(0, () => 0)).toBe(750);
        expect(retryDelay(0, () => 1)).toBe(1_250);
    });
});

describe('notices', () =>
{
    it('speaks up for offers and answers, not for withdrawn or expired ones', () =>
    {
        expect(eventNotice({ type: 'trade.received', by: 'asha' })).toBe('asha sent you a trade offer');
        expect(eventNotice({ type: 'trade.accepted', by: 'ben' })).toBe('ben accepted your trade');
        expect(eventNotice({ type: 'trade.cancelled', by: 'asha' })).toBeNull();
        expect(eventNotice({ type: 'trade.expired' })).toBeNull();
    });
    it('knows which events touch trades', () =>
    {
        expect(isTradeEvent({ type: 'trade.expired' })).toBe(true);
        expect(isTradeEvent({ type: 'pack.ready' })).toBe(false);
    });
});
