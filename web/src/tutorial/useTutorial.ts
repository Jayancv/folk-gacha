import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ME_KEY, type Me } from '../auth/useAuth';
import { MergeBoardEvents } from '../bridge/events';
import { useBridgeEvent } from '../bridge/useBridgeEvent';
import type { CardData } from '../game/cards/model';
import type { Tab } from '../app/useTabs';
import { advance, findPair, finishesOnNext, firstStep, stepContent, stepNumber, type TutorialEvent, type TutorialStep } from './tutorialModel';

interface TableState
{
    tab: Tab;
    /** Today's pack is on the table. */
    packOpened: boolean;
    /** Every card of it is face up. */
    packRevealed: boolean;
    /** The cards the Board last laid out (null until it loads). */
    boardCards: CardData[] | null;
    /** The dev ?showcase page: no tutorial there. */
    showcase: boolean;
}

/**
 * Drives the first-time tutorial from what the player actually does. Shown until the
 * account has finished or skipped it once (recorded on the server, so every device knows).
 */
export function useTutorial (me: Me, table: TableState)
{
    const qc = useQueryClient();
    const [step, setStep] = useState<TutorialStep>(() => firstStep(me.dailyPack?.ready ?? true));
    const [finished, setFinished] = useState(false);
    // Only when the server explicitly says "not done": an older API without the field (e.g. the
    // web app deployed before the server) must not walk every existing player through it.
    const active = me.tutorialDone === false && !finished && !table.showcase;

    const fire = (event: TutorialEvent) => setStep(s => advance(s, event));

    useEffect(() =>
    {
        if (table.packOpened)
        {
            fire('claimed');
        }
    }, [table.packOpened]);

    useEffect(() =>
    {
        if (table.packRevealed)
        {
            fire('revealed');
        }
    }, [table.packRevealed]);

    // On the Board, with its cards loaded: is there a pair to practise on?
    const pair = table.boardCards ? findPair(table.boardCards) : null;
    useEffect(() =>
    {
        if (table.tab === 'MergeBoard' && table.boardCards)
        {
            fire(findPair(table.boardCards) ? 'board-with-pair' : 'board-without-pair');
        }
    }, [table.tab, table.boardCards]);

    useBridgeEvent(MergeBoardEvents.MergeResult, result =>
    {
        if (result.ok)
        {
            fire('merged');
        }
    });

    const finish = () =>
    {
        setFinished(true);
        qc.setQueryData<Me | null>(ME_KEY, m => (m ? { ...m, tutorialDone: true } : m));
        // Best effort: if it fails, the tutorial may show again next time, which is harmless.
        void api.POST('/me/tutorial').catch(() => undefined);
    };

    const next = () =>
    {
        if (finishesOnNext(step))
        {
            finish();
        }
        else
        {
            fire('next');
        }
    };

    return {
        active,
        step,
        number: stepNumber(step),
        content: stepContent(step, pair),
        next,
        skip: finish
    };
}
