import { useState } from 'react';
import { EventBus } from '../bridge/EventBus';
import { GameEvents, type GameScene } from '../bridge/events';

// Pack and Board are Phaser scenes; Cards and Ranks are React screens over the (sleeping) table.
export type ReactScreen = 'Collection' | 'Leaderboard';
export type Tab = GameScene | ReactScreen;

export const isReactScreen = (tab: Tab): tab is ReactScreen => tab === 'Collection' || tab === 'Leaderboard';

/** The open tab. Switching starts the Phaser scene, or sleeps the game loop under a React screen. */
export function useTabs ()
{
    const [tab, setTab] = useState<Tab>('PackOpen');
    const [scene, setScene] = useState<GameScene>('PackOpen');
    // The collection stays mounted after its first visit, keeping its filters and scroll.
    const [collectionOpened, setCollectionOpened] = useState(false);

    const switchTo = (next: Tab) =>
    {
        const wasCovered = isReactScreen(tab);
        setTab(next);
        if (next === 'Collection')
        {
            setCollectionOpened(true);
        }
        if (isReactScreen(next))
        {
            if (!wasCovered)
            {
                EventBus.emit(GameEvents.SetPaused, { paused: true });
            }
            return;
        }
        if (wasCovered)
        {
            EventBus.emit(GameEvents.SetPaused, { paused: false });
        }
        if (next !== scene)
        {
            setScene(next);
            EventBus.emit(GameEvents.SwitchScene, { scene: next });
        }
    };

    return { tab, collectionOpened, switchTo };
}
