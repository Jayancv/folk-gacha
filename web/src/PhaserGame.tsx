import { useLayoutEffect, useRef } from 'react';
import StartGame from './game/main';

// Mounts the Phaser game. React talks to it only through the bridge (src/bridge/).
export function PhaserGame ()
{
    const game = useRef<Phaser.Game | null>(null);

    useLayoutEffect(() =>
    {
        game.current ??= StartGame('game-container');

        return () =>
        {
            // Scenes unsubscribe from the bridge on destroy (ResponsiveScene.onBridge).
            game.current?.destroy(true);
            game.current = null;
        };
    }, []);

    return <div id="game-container"></div>;
}
