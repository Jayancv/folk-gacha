// Pure merge-board rules and geometry (no Phaser), shared by the MergeBoard scene and tests.

import { CARD_H, CARD_W } from '../cards/drawCard';
import { MAX_LEVEL, type CardData } from '../cards/model';
import type { MergeFailure, MergeResultPayload } from '../../bridge/events';
import { DESIGN_WIDTH } from '../layout';

// 4 columns of cards at 72% size; 4 rows fit on screen, more scroll.
export const COLS = 4;
export const ROWS = 4;
/** The slots on the first screen (the smallest board). */
export const BOARD_SIZE = COLS * ROWS;
/** The most cards the scrolling board loads (GET /cards pages hold up to 200). */
export const BOARD_LIMIT = 100;

/** How long the board waits for a merge answer before showing a network failure. */
export const RESULT_TIMEOUT_MS = 8000;
export const BOARD_SCALE = 0.72;
export const CELL_W = CARD_W * BOARD_SCALE;
export const CELL_H = CARD_H * BOARD_SCALE;
export const GAP = 14;
export const GRID_TOP = 210;
export const ROW_H = CELL_H + GAP;
const LEFT = (DESIGN_WIDTH - (COLS * CELL_W + (COLS - 1) * GAP)) / 2;

/** A slot's centre in design space before scrolling, row by row. */
export function slotPosition (i: number): { x: number; y: number }
{
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return { x: LEFT + CELL_W / 2 + col * (CELL_W + GAP), y: GRID_TOP + CELL_H / 2 + row * ROW_H };
}

/** The first screen's slot centres. */
export const SLOTS: { x: number; y: number }[] = Array.from({ length: BOARD_SIZE }, (_, i) => slotPosition(i));

/**
 * Slot index under a design-space point, or -1. Half the gap counts towards each cell.
 * `scroll`: how far the board is scrolled up; `count`: slots on the board.
 */
export function slotAt (x: number, y: number, scroll = 0, count = BOARD_SIZE): number
{
    const col = Math.round((x - LEFT - CELL_W / 2) / (CELL_W + GAP));
    const row = Math.round((y + scroll - GRID_TOP - CELL_H / 2) / ROW_H);
    if (col < 0 || col >= COLS || row < 0)
    {
        return -1;
    }
    const i = row * COLS + col;
    const s = slotPosition(i);
    const inside = Math.abs(x - s.x) <= CELL_W / 2 + GAP / 2 && Math.abs(y + scroll - s.y) <= CELL_H / 2 + GAP / 2;
    return inside && i < count ? i : -1;
}

/** Slots for this many cards: full rows, never fewer than the first screen. */
export function slotCountFor (cards: number): number
{
    return Math.max(BOARD_SIZE, Math.ceil(cards / COLS) * COLS);
}

/** How far the board can scroll so its last row ends at `viewBottom` (design units); 0 if it fits. */
export function maxScroll (slots: number, viewBottom: number): number
{
    const rows = Math.ceil(slots / COLS);
    const bottom = GRID_TOP + rows * ROW_H - GAP;
    return Math.max(0, bottom - viewBottom);
}

/** Scroll speed while dragging a card near the top or bottom edge (design units per frame), or 0. */
export function edgeScrollSpeed (y: number, top: number, bottom: number, zone = 110, max = 18): number
{
    if (y < top + zone)
    {
        return -max * Math.min(1, (top + zone - y) / zone);
    }
    if (y > bottom - zone)
    {
        return max * Math.min(1, (y - (bottom - zone)) / zone);
    }
    return 0;
}

type BoardCard = CardData & { inTrade?: boolean; inTournament?: boolean };

/**
 * The board's order: cards that can level up together first, each group side by side
 * (groups in the order their newest card came), then everything else in the given
 * (newest first) order. Locked and max-level cards never count as a pair.
 */
export function boardOrder<C extends BoardCard> (cards: readonly C[]): C[]
{
    const key = (c: C) => `${c.templateId}:${c.level}`;
    const free = (c: C) => c.level < MAX_LEVEL && !c.inTrade && !c.inTournament;
    const groups = new Map<string, C[]>();
    for (const c of cards)
    {
        if (free(c))
        {
            groups.set(key(c), [...(groups.get(key(c)) ?? []), c]);
        }
    }
    const pairs = [...groups.values()].filter(g => g.length >= 2).flat();
    const paired = new Set(pairs.map(c => c.id));
    return [...pairs, ...cards.filter(c => !paired.has(c.id))];
}

/**
 * The public level-up rule: same card at the same level, below max level.
 * Used only to highlight targets; the server still decides. Recipes are never hinted.
 */
export function isLevelUpMatch (a: CardData, b: CardData): boolean
{
    return a.id !== b.id && a.templateId === b.templateId && a.level === b.level && a.level < MAX_LEVEL;
}

/** "Merge" from a card's sheet: the board opens on that card and the cards it can level up with. */
export interface BoardFocus
{
    id: string;
    templateId: string;
    level: number;
}

/**
 * The cards to lay out for a focused board: the focused card first, then its level-up matches
 * (`matches`: same spirit and level), then the newest cards to fill the board. Each card once.
 */
export function focusLayout<C extends CardData> (focusId: string, matches: readonly C[], newest: readonly C[], size = BOARD_LIMIT): C[]
{
    const ordered = [...matches.filter(c => c.id === focusId), ...matches.filter(c => c.id !== focusId), ...newest];
    const seen = new Set<string>();
    return ordered.filter(c => !seen.has(c.id) && seen.add(c.id)).slice(0, size);
}

/**
 * The line over the board. `focus`: opened with Merge on a card (its spirit's name, and how
 * many of its level-up matches are on the board).
 */
export function boardHint (shown: number, total: number, focus?: { name: string; matches: number }): string
{
    const count = total > shown ? `Showing ${shown} of ${total} cards` : `${shown} cards`;
    if (focus && focus.matches > 0)
    {
        return `Drag one ${focus.name} onto another to level up\n${count}`;
    }
    if (focus)
    {
        return `No ${focus.name} to level up with yet\nTry it on a different spirit: some combine`;
    }
    return `Drag a card onto another to merge\n${count}`;
}

export const FAILURE_TEXT: Record<MergeFailure, string> = {
    no_recipe: 'Nothing happened…',
    max_level: 'Already max level',
    not_owned: 'Card unavailable',
    sold_out: 'None left this season',
    in_trade: 'Offered in a trade',
    in_tournament: 'In a tournament',
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
