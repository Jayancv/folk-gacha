import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { claimDailyPack, type ClaimError } from '../../api/game';
import { ME_KEY } from '../../auth/useAuth';
import { EventBus } from '../../bridge/EventBus';
import { PackOpenEvents } from '../../bridge/events';
import { useBridgeEvent } from '../../bridge/useBridgeEvent';
import { SHOWCASE, useShowcase } from '../../dev/useShowcase';
import type { CardData } from '../../game/cards/model';
import { CARDS_KEY } from '../collection/useCollection';
import { LEADERBOARD_KEY } from '../leaderboard/useLeaderboard';
import { PROFILE_KEY } from '../profile/useProfile';

/** Today's opened pack, kept for this session so the Pack tab can show it again. */
interface OpenedPack
{
    cards: CardData[];
    /** When it stops being today's pack (the next 00:00 UTC). */
    expiresAt: number;
}

/**
 * Drives the PackOpen scene: claims today's pack (POST /packs/daily/claim) when the
 * player asks, deals it, re-deals it when the player comes back to the tab, and
 * forgets it at the next 00:00 UTC. With ?showcase it deals local dev packs instead.
 */
export function usePackTable ()
{
    const qc = useQueryClient();
    const [pack, setPack] = useState<OpenedPack | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [claimError, setClaimError] = useState<ClaimError | null>(null);
    const showcase = useShowcase();

    const refreshMe = useCallback(() => void qc.invalidateQueries({ queryKey: ME_KEY }), [qc]);

    const deal = (cards: CardData[]) =>
    {
        setRevealed(false);
        EventBus.emit(PackOpenEvents.Show, { cards });
    };

    const claim = async () =>
    {
        setClaiming(true);
        setClaimError(null);
        const outcome = await claimDailyPack();
        setClaiming(false);
        if (outcome.ok)
        {
            setPack({ cards: outcome.cards, expiresAt: Date.parse(outcome.nextResetAt) });
            deal(outcome.cards);
            void qc.invalidateQueries({ queryKey: CARDS_KEY });
            void qc.invalidateQueries({ queryKey: LEADERBOARD_KEY }); // the pack earned season points
            void qc.invalidateQueries({ queryKey: PROFILE_KEY }); // new cards: stats and best cards
        }
        else
        {
            setClaimError(outcome.error);
        }
        // Today's status changed (or we learned it was already claimed, or the session ended).
        refreshMe();
    };

    const dealShowcase = () =>
    {
        if (showcase)
        {
            const cards = showcase();
            setPack({ cards, expiresAt: Infinity });
            deal(cards);
        }
    };

    // At the next 00:00 UTC today's pack is yesterday's: offer the new one.
    useEffect(() =>
    {
        if (!pack || pack.expiresAt === Infinity)
        {
            return;
        }
        const timer = setTimeout(() =>
        {
            setPack(null);
            refreshMe();
        }, Math.max(0, pack.expiresAt - Date.now()));
        return () => clearTimeout(timer);
    }, [pack, refreshMe]);

    // Coming back to the Pack tab re-deals the opened pack (if any).
    useBridgeEvent(PackOpenEvents.Ready, () =>
    {
        if (pack)
        {
            deal(pack.cards);
        }
    });
    useBridgeEvent(PackOpenEvents.Complete, () => setRevealed(true));

    return {
        /** Whether a pack is on the table (otherwise the claim panel shows). */
        opened: pack !== null,
        /** Every card of the pack on the table is face up. */
        revealed,
        claiming,
        claimError,
        claim: () => void claim(),
        refreshMe,
        /** Dev ?showcase controls; null in the normal game. */
        showcase: SHOWCASE ? { ready: showcase !== null, deal: dealShowcase } : null
    };
}
