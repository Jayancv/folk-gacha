import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { claimDailyPack, openGifts, type ClaimError, type GiftError } from '../../api/game';
import { ME_KEY } from '../../auth/useAuth';
import { EventBus } from '../../bridge/EventBus';
import { PackOpenEvents } from '../../bridge/events';
import { useBridgeEvent } from '../../bridge/useBridgeEvent';
import { SHOWCASE, useShowcase } from '../../dev/useShowcase';
import type { CardData } from '../../game/cards/model';
import { CARDS_KEY } from '../collection/useCollection';
import { LEADERBOARD_KEY } from '../leaderboard/useLeaderboard';
import { PROFILE_KEY } from '../profile/useProfile';
import { giftTitle } from './dailyPack';

/** Today's opened pack, kept for this session so the Pack tab can show it again. */
interface OpenedPack
{
    cards: CardData[];
    /** When it stops being today's pack (the next 00:00 UTC). */
    expiresAt: number;
}

/** Trade gifts just opened: on the table until the player taps Done. */
interface OpenedGift
{
    cards: CardData[];
    title: string;
    /** Cards flipped so far: they stay face up when the table is dealt again. */
    revealed: number[];
}

/**
 * Drives the PackOpen scene: claims today's pack (POST /packs/daily/claim) when the
 * player asks, deals it, re-deals it when the player comes back to the tab, and
 * forgets it at the next 00:00 UTC. Trade gifts (POST /gifts/open) are dealt the same
 * way, over the pack, until Done. With ?showcase it deals local dev packs instead.
 */
export function usePackTable ()
{
    const qc = useQueryClient();
    const [pack, setPack] = useState<OpenedPack | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [claimError, setClaimError] = useState<ClaimError | null>(null);
    const [gift, setGift] = useState<OpenedGift | null>(null);
    const [openingGift, setOpeningGift] = useState(false);
    const [giftError, setGiftError] = useState<GiftError | null>(null);
    const showcase = useShowcase();

    const refreshMe = useCallback(() => void qc.invalidateQueries({ queryKey: ME_KEY }), [qc]);

    const deal = (cards: CardData[], title?: string, faceUp?: number[]) =>
    {
        setRevealed(false);
        EventBus.emit(PackOpenEvents.Show, { cards, title, faceUp });
    };

    const openGift = async () =>
    {
        setOpeningGift(true);
        setGiftError(null);
        const outcome = await openGifts();
        setOpeningGift(false);
        if (outcome.ok)
        {
            const opened = { cards: outcome.cards, title: giftTitle(outcome.partners), revealed: [] };
            setGift(opened);
            deal(opened.cards, opened.title);
            void qc.invalidateQueries({ queryKey: CARDS_KEY });
            void qc.invalidateQueries({ queryKey: PROFILE_KEY });
        }
        else
        {
            setGiftError(outcome.error);
        }
        refreshMe(); // gifts waiting changed
    };

    // Done with the gift: back to today's pack, or the empty table and its panel.
    const closeGift = () =>
    {
        setGift(null);
        if (pack)
        {
            deal(pack.cards);
        }
        else
        {
            deal([]);
        }
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

    // Coming back to the Pack tab re-deals what was on the table (if anything).
    useBridgeEvent(PackOpenEvents.Ready, () =>
    {
        if (gift)
        {
            deal(gift.cards, gift.title, gift.revealed); // an opened gift stays open
        }
        else if (pack)
        {
            deal(pack.cards);
        }
    });
    useBridgeEvent(PackOpenEvents.CardRevealed, ({ index }) =>
        setGift(g => (g && !g.revealed.includes(index) ? { ...g, revealed: [...g.revealed, index] } : g)));
    useBridgeEvent(PackOpenEvents.Complete, () => setRevealed(true));

    return {
        /** Whether a pack or gift is on the table (otherwise the claim panel shows). */
        opened: pack !== null || gift !== null,
        /** Today's pack is on the table (not a gift). */
        packOnTable: pack !== null && gift === null,
        /** Trade gifts are on the table. */
        giftOnTable: gift !== null,
        openingGift,
        giftError,
        openGift: () => void openGift(),
        closeGift,
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
