import { Boot } from './scenes/Boot';
import { DebugOverlay } from './scenes/DebugOverlay';
import { PackOpen } from './scenes/PackOpen';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { attachHiDpiScaling, measureParent } from './scale';

const StartGame = (parentId: string) => {

    const parent = document.getElementById(parentId);
    if (!parent)
    {
        throw new Error(`#${parentId} not found`);
    }

    // Size the canvas in device pixels from the start; see layout.ts for why.
    const viewport = measureParent(parent);

    //  Find out more information about the Game Config at:
    //  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
    const game = new Game({
        type: AUTO,
        parent,
        backgroundColor: '#170e10',
        scale: {
            mode: Scale.NONE,
            width: viewport.canvasWidth,
            height: viewport.canvasHeight,
            zoom: 1 / viewport.pixelRatio
        },
        scene: [
            Boot,
            Preloader,
            PackOpen,
            DebugOverlay
        ]
    });

    attachHiDpiScaling(game, parent, viewport);

    // Handy in the browser console and for automated checks; stripped from production builds.
    if (import.meta.env.DEV)
    {
        (window as unknown as { __game: Game }).__game = game;
    }

    if (new URLSearchParams(location.search).has('debug'))
    {
        game.events.once('ready', () => game.scene.start('DebugOverlay'));
    }

    return game;

}

export default StartGame;
