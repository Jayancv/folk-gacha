import * as Phaser from 'phaser';
import { computeViewport, sameViewport, type Viewport } from './layout';

// Emitted on game.events whenever the canvas size or pixel ratio changes.
export const LAYOUT_CHANGE = 'layout-change';

const viewports = new WeakMap<Phaser.Game, Viewport>();

export function measureParent (parent: HTMLElement): Viewport
{
    return computeViewport(parent.clientWidth, parent.clientHeight, window.devicePixelRatio);
}

export function getViewport (game: Phaser.Game): Viewport
{
    const vp = viewports.get(game);
    if (!vp)
    {
        throw new Error('getViewport called before attachHiDpiScaling');
    }
    return vp;
}

// Keeps the canvas backing store at device-pixel resolution and its CSS size
// matching the parent element. Uses ScaleManager NONE mode with zoom = 1 / pixelRatio,
// so Phaser still maps pointer input correctly (it reads the canvas' on-screen rect).
export function attachHiDpiScaling (game: Phaser.Game, parent: HTMLElement, initial: Viewport): void
{
    viewports.set(game, initial);

    let frame = 0;

    // `force` is used once at boot: Phaser sized the canvas CSS from width * zoom,
    // which can be off by a fraction of a pixel from the parent and blur everything.
    const apply = (force = false) =>
    {
        frame = 0;
        const next = measureParent(parent);
        if (!force && sameViewport(viewports.get(game), next))
        {
            return;
        }

        const scale = game.scale;
        if (scale.zoom !== 1 / next.pixelRatio)
        {
            scale.setZoom(1 / next.pixelRatio);
        }
        scale.resize(next.canvasWidth, next.canvasHeight);

        // resize() skips the CSS size when it equals the canvas size (pixelRatio 1),
        // which can leave a stale value from before. Always set it explicitly.
        scale.canvas.style.width = `${next.cssWidth}px`;
        scale.canvas.style.height = `${next.cssHeight}px`;
        scale.refresh();

        viewports.set(game, next);
        game.events.emit(LAYOUT_CHANGE, next);
    };

    const schedule = () =>
    {
        if (!frame)
        {
            frame = requestAnimationFrame(() => apply());
        }
    };

    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(parent);

    // Fires when the window moves to a screen with a different pixel ratio.
    let dprQuery: MediaQueryList | null = null;
    const watchPixelRatio = () =>
    {
        dprQuery?.removeEventListener('change', onPixelRatioChange);
        dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        dprQuery.addEventListener('change', onPixelRatioChange);
    };
    const onPixelRatioChange = () =>
    {
        watchPixelRatio();
        schedule();
    };
    watchPixelRatio();

    game.events.once(Phaser.Core.Events.READY, () => apply(true));

    game.events.once(Phaser.Core.Events.DESTROY, () =>
    {
        resizeObserver.disconnect();
        dprQuery?.removeEventListener('change', onPixelRatioChange);
        if (frame)
        {
            cancelAnimationFrame(frame);
        }
        viewports.delete(game);
    });
}
