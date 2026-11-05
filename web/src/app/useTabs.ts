import { useState } from 'react';
import { EventBus } from '../bridge/EventBus';
import { GameEvents, type GameScene } from '../bridge/events';
import { browserStorage, readCardsView, saveCardsView, type CardsView, type NavTab } from './cardsView';

// Pack and Board are Phaser scenes; the List (collection), Trades, Tournament and Ranks are React screens
// over the (sleeping) table. Board and List are the two views of the Cards tab.
export type ReactScreen = 'Collection' | 'Trades' | 'Tournaments' | 'Leaderboard';
export type Tab = GameScene | ReactScreen;

export const isReactScreen = (tab: Tab): tab is ReactScreen =>
    tab === 'Collection' || tab === 'Trades' || tab === 'Tournaments' || tab === 'Leaderboard';

/** The open tab. Switching starts the Phaser scene, or sleeps the game loop under a React screen. */
export function useTabs ()
{
    const [tab, setTab] = useState<Tab>('PackOpen');
    const [scene, setScene] = useState<GameScene>('PackOpen');
    // The Cards tab's view, remembered on this device.
    const [cardsView, setCardsView] = useState<CardsView>(() => readCardsView(browserStorage()));
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

    /** A tab bar button: Cards opens the view used last. */
    const openNav = (nav: NavTab) => switchTo(nav === 'Cards' ? cardsView : nav);

    /** The Board / List switch on the Cards tab. */
    const showCardsView = (view: CardsView) =>
    {
        setCardsView(view);
        saveCardsView(browserStorage(), view);
        switchTo(view);
    };

    return { tab, collectionOpened, switchTo, openNav, showCardsView };
}
