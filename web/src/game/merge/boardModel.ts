// Pure merge-board rules and geometry (no Phaser), shared by the MergeBoard scene and tests.

import { CARD_H, CARD_W } from '../cards/drawCard';
import { MAX_LEVEL, type CardData } from '../cards/model';
import type { MergeFailure, MergeResultPayload } from '../../bridge/events';
import { DESIGN_WIDTH } from '../layout';

// 4 x 4 board of cards at 72% size.
export const COLS = 4;
export const ROWS = 4;
export const BOARD_SIZE = COLS * ROWS;

/** How long the board waits for a merge answer before showing a network failure. */
export const RESULT_TIMEOUT_MS = 8000;
export const BOARD_SCALE = 0.72;
export const CELL_W = CARD_W * BOARD_SCALE;
export const CELL_H = CARD_H * BOARD_SCALE;
export const GAP = 14;
export const GRID_TOP = 210;

/** Slot centres in design space, row by row. */
export const SLOTS: { x: number; y: number }[] = Array.from({ length: BOARD_SIZE }, (_, i) =>
{
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const left = (DESIGN_WIDTH - (COLS * CELL_W + (COLS - 1) * GAP)) / 2;
    return {
        x: left + CELL_W / 2 + col * (CELL_W + GAP),
        y: GRID_TOP + CELL_H / 2 + row * (CELL_H + GAP)
    };
});

/** Slot index under a design-space point, or -1. Half the gap counts towards each cell. */
export function slotAt (x: number, y: number): number
{
    return SLOTS.findIndex(s => Math.abs(x - s.x) <= CELL_W / 2 + GAP / 2 && Math.abs(y - s.y) <= CELL_H / 2 + GAP / 2);
}

/**
 * The public level-up rule: same card at the same level, below max level.
 * Used only to highlight targets; the server still decides. Recipes are never hinted.
 */
export function isLevelUpMatch (a: CardData, b: CardData): boolean
{
    return a.id !== b.id && a.templateId === b.templateId && a.level === b.level && a.level < MAX_LEVEL;
}

export function boardHint (shown: number, total: number): string
{
    const count = total > shown ? `Showing ${shown} of ${total} cards` : `${shown} cards`;
    return `Drag a card onto another to merge\n${count}`;
}

export const FAILURE_TEXT: Record<MergeFailure, string> = {
    no_recipe: 'Nothing happened…',
    max_level: 'Already max level',
    not_owned: 'Card unavailable',
    sold_out: 'None left this season',
    network: 'No answer, try again'
};

/** Text that floats up when a merge succeeds. */
export function mergeLabel (result: Extract<MergeResultPayload, { ok: true }>): string
{
    if (result.kind === 'level_up')
    {
        return `Level ${result.card.level}!`;
    }
    return result.discovered ? `New recipe!\n${result.card.name}` : result.card.name;
}
