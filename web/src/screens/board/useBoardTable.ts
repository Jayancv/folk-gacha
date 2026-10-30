import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { loadBoard, mergeCards } from '../../api/game';
import { ME_KEY } from '../../auth/useAuth';
import { EventBus } from '../../bridge/EventBus';
import { MergeBoardEvents } from '../../bridge/events';
import { useBridgeEvent } from '../../bridge/useBridgeEvent';
import type { CardData } from '../../game/cards/model';
import { BOARD_SIZE, RESULT_TIMEOUT_MS } from '../../game/merge/boardModel';
import { CARDS_KEY } from '../collection/useCollection';
import { LEADERBOARD_KEY } from '../leaderboard/useLeaderboard';
import { PROFILE_KEY } from '../profile/useProfile';

/** How long to wait before reloading a board that may be out of date: after the failure animation. */
const RESYNC_DELAY_MS = 1200;

/**
 * Drives the MergeBoard scene: lays out the newest cards (GET /cards) when the scene is
 * ready and sends merges to the server (POST /merges). When the board may no longer
 * match the server (an answer came too late, never came, or a card was used elsewhere)
 * it reloads the board.
 */
export function useBoardTable ()
{
    const qc = useQueryClient();
    const [loadError, setLoadError] = useState(false);
    // The cards the board last laid out (the tutorial looks for a pair in them).
    const [cards, setCards] = useState<CardData[] | null>(null);
    // Only the newest board load may lay out cards (an older, slower one is dropped).
    const latestLoad = useRef(0);

    // Merges change the cards (and so profiles) and earn season points.
    const refreshCollection = () =>
    {
        void qc.invalidateQueries({ queryKey: CARDS_KEY });
        void qc.invalidateQueries({ queryKey: LEADERBOARD_KEY });
        void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    };

    const reload = async () =>
    {
        const id = ++latestLoad.current;
        try
        {
            const board = await loadBoard(BOARD_SIZE);
            if (id === latestLoad.current)
            {
                setLoadError(false);
                setCards(board.cards);
                EventBus.emit(MergeBoardEvents.Show, board);
            }
        }
        catch (err)
        {
            console.warn('board: could not load cards', err);
            if (id === latestLoad.current)
            {
                setLoadError(true);
            }
        }
    };

    useBridgeEvent(MergeBoardEvents.Ready, () => void reload());
    useBridgeEvent(MergeBoardEvents.MergeRequested, async ({ requestId, cardIds }) =>
    {
        const started = performance.now();
        const { result, status } = await mergeCards(requestId, cardIds);
        EventBus.emit(MergeBoardEvents.MergeResult, result);

        if (status === 401)
        {
            void qc.invalidateQueries({ queryKey: ME_KEY }); // session ended: back to sign-in
            return;
        }
        const late = performance.now() - started >= RESULT_TIMEOUT_MS;
        const unsure = !result.ok && (result.error === 'network' || result.error === 'not_owned');
        if (result.ok || late || unsure)
        {
            refreshCollection();
        }
        if (late || unsure)
        {
            setTimeout(() => void reload(), RESYNC_DELAY_MS);
        }
    });

    return { loadError, cards, retry: () => void reload() };
}
