import { useState } from 'react';
import { EventBus } from '../bridge/EventBus';
import { GameEvents, type GameScene } from '../bridge/events';

// Pack and Board are Phaser scenes; Cards is a React screen over the (sleeping) table.
export type Tab = GameScene | 'Collection';

/** The open tab. Switching starts the Phaser scene, or sleeps the game loop under the collection. */
export function useTabs ()
{
    const [tab, setTab] = useState<Tab>('PackOpen');
    const [scene, setScene] = useState<GameScene>('PackOpen');
    // The collection stays mounted after its first visit, keeping its filters and scroll.
    const [collectionOpened, setCollectionOpened] = useState(false);

    const switchTo = (next: Tab) =>
    {
        const wasCollection = tab === 'Collection';
        setTab(next);
        if (next === 'Collection')
        {
            setCollectionOpened(true);
            EventBus.emit(GameEvents.SetPaused, { paused: true });
            return;
        }
        if (wasCollection)
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
