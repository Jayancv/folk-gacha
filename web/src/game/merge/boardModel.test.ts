import { describe, expect, it } from 'vitest';
import { makeCard, TEMPLATES } from '../../dev/fakePack';
import { MAX_LEVEL } from '../cards/model';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../layout';
import {
    BOARD_SIZE,
    boardHint,
    CELL_H,
    CELL_W,
    FAILURE_TEXT,
    GAP,
    isLevelUpMatch,
    mergeLabel,
    SLOTS,
    slotAt
} from './boardModel';

const t = (id: string) => TEMPLATES.find(t => t.templateId === id)!;

describe('board geometry', () =>
{
    it('has one slot per board position, row by row', () =>
    {
        expect(SLOTS).toHaveLength(BOARD_SIZE);
        expect(SLOTS[1].x).toBeGreaterThan(SLOTS[0].x);
        expect(SLOTS[4].y).toBeGreaterThan(SLOTS[0].y);
        expect(SLOTS[4].x).toBeCloseTo(SLOTS[0].x);
    });

    it('fits inside the design safe area and is horizontally centred', () =>
    {
        for (const s of SLOTS)
        {
            expect(s.x - CELL_W / 2).toBeGreaterThanOrEqual(0);
            expect(s.x + CELL_W / 2).toBeLessThanOrEqual(DESIGN_WIDTH);
            expect(s.y - CELL_H / 2).toBeGreaterThanOrEqual(0);
            expect(s.y + CELL_H / 2).toBeLessThanOrEqual(DESIGN_HEIGHT);
        }
        const left = SLOTS[0].x - CELL_W / 2;
        const right = DESIGN_WIDTH - (SLOTS[3].x + CELL_W / 2);
        expect(left).toBeCloseTo(right);
    });

    it('leaves room at the bottom for the React tab bar', () =>
    {
        const bottom = Math.max(...SLOTS.map(s => s.y + CELL_H / 2));
        expect(bottom).toBeLessThanOrEqual(1160);
    });

    it('cells do not overlap', () =>
    {
        expect(SLOTS[1].x - SLOTS[0].x).toBeCloseTo(CELL_W + GAP);
        expect(SLOTS[4].y - SLOTS[0].y).toBeCloseTo(CELL_H + GAP);
    });
});

describe('slotAt', () =>
{
    it('finds the slot under each slot centre', () =>
    {
        SLOTS.forEach((s, i) => expect(slotAt(s.x, s.y)).toBe(i));
    });

    it('counts half the gap towards each neighbouring cell', () =>
    {
        const s = SLOTS[5];
        expect(slotAt(s.x + CELL_W / 2 + GAP / 2 - 0.5, s.y)).toBe(5);
        expect(slotAt(s.x + CELL_W / 2 + GAP / 2 + 0.5, s.y)).toBe(6);
    });

    it('returns -1 outside the board', () =>
    {
        expect(slotAt(DESIGN_WIDTH / 2, 50)).toBe(-1);
        expect(slotAt(-100, SLOTS[0].y)).toBe(-1);
        expect(slotAt(DESIGN_WIDTH / 2, DESIGN_HEIGHT)).toBe(-1);
    });
});

describe('isLevelUpMatch', () =>
{
    it('matches the same card at the same level', () =>
    {
        expect(isLevelUpMatch(makeCard(t('malu')), makeCard(t('malu')))).toBe(true);
    });

    it('rejects different levels, different cards and max level', () =>
    {
        expect(isLevelUpMatch(makeCard(t('malu'), 1), makeCard(t('malu'), 2))).toBe(false);
        expect(isLevelUpMatch(makeCard(t('malu')), makeCard(t('ura')))).toBe(false);
        expect(isLevelUpMatch(makeCard(t('malu'), MAX_LEVEL), makeCard(t('malu'), MAX_LEVEL))).toBe(false);
    });

    it('does not match a card with itself', () =>
    {
        const card = makeCard(t('malu'));
        expect(isLevelUpMatch(card, card)).toBe(false);
    });

    it('never hints recipes (recipe partners are not matches)', () =>
    {
        expect(isLevelUpMatch(makeCard(t('gaja-calf')), makeCard(t('simha')))).toBe(false);
    });
});

describe('board text', () =>
{
    it('shows a plain count when everything fits', () =>
    {
        expect(boardHint(11, 11)).toBe('Drag a card onto another to merge\n11 cards');
    });

    it('says how many are hidden when the collection is bigger than the board', () =>
    {
        expect(boardHint(16, 21)).toBe('Drag a card onto another to merge\nShowing 16 of 21 cards');
    });

    it('has a message for every failure', () =>
    {
        for (const key of ['no_recipe', 'max_level', 'not_owned', 'network'] as const)
        {
            expect(FAILURE_TEXT[key]).toBeTruthy();
        }
    });

    it('labels level-ups, new recipes and known recipes', () =>
    {
        const lvl2 = makeCard(t('gaja-calf'), 2);
        const gajasinghe = makeCard(t('gajasinghe'));
        expect(mergeLabel({ requestId: 'r', ok: true, kind: 'level_up', card: lvl2, discovered: false })).toBe('Level 2!');
        expect(mergeLabel({ requestId: 'r', ok: true, kind: 'recipe', card: gajasinghe, discovered: true })).toBe('New recipe!\nGajasinghe');
        expect(mergeLabel({ requestId: 'r', ok: true, kind: 'recipe', card: gajasinghe, discovered: false })).toBe('Gajasinghe');
    });
});
