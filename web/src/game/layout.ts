// Pure layout math for the game canvas. No Phaser imports, so it is easy to unit test.
//
// Scenes are authored in a fixed portrait "design space" of DESIGN_WIDTH x DESIGN_HEIGHT.
// That rectangle is the safe area: it is always fully visible and centered.
// Extra screen space (wide desktop windows, tall phones) shows more of the world
// around it, like Phaser's EXPAND mode, so backgrounds should cover `visible`.
//
// Unlike EXPAND, the canvas backing store is sized in *device* pixels and the
// camera zooms the design space up to it. That keeps art and text sharp on
// high-DPI phones instead of upscaling a low-resolution canvas.

export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

// Rendering above 3x costs fill rate with no visible gain on current phones.
export const MAX_PIXEL_RATIO = 3;

// Text textures are capped to bound memory use on huge desktop monitors.
export const MAX_TEXT_RESOLUTION = 4;

export interface Rect
{
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Viewport
{
    /** Size of the game's parent element in CSS pixels. */
    cssWidth: number;
    cssHeight: number;
    /** Device pixels per CSS pixel actually used for rendering (clamped devicePixelRatio). */
    pixelRatio: number;
    /** Canvas backing-store size in device pixels. */
    canvasWidth: number;
    canvasHeight: number;
    /** Camera zoom: device pixels per design unit. */
    zoom: number;
    /** The part of design space that is on screen. Always contains the full safe area. */
    visible: Rect;
    /** Resolution to render Text objects at so they map 1:1 to device pixels. */
    textResolution: number;
}

export function computeViewport (cssWidth: number, cssHeight: number, devicePixelRatio: number): Viewport
{
    // A hidden or not-yet-laid-out parent reports 0; keep the math finite.
    const w = Math.max(1, cssWidth);
    const h = Math.max(1, cssHeight);

    const pixelRatio = clamp(devicePixelRatio || 1, 1, MAX_PIXEL_RATIO);

    const canvasWidth = Math.max(1, Math.round(w * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(h * pixelRatio));

    const zoom = Math.min(canvasWidth / DESIGN_WIDTH, canvasHeight / DESIGN_HEIGHT);

    const visibleWidth = canvasWidth / zoom;
    const visibleHeight = canvasHeight / zoom;

    return {
        cssWidth: w,
        cssHeight: h,
        pixelRatio,
        canvasWidth,
        canvasHeight,
        zoom,
        visible: {
            x: (DESIGN_WIDTH - visibleWidth) / 2,
            y: (DESIGN_HEIGHT - visibleHeight) / 2,
            width: visibleWidth,
            height: visibleHeight
        },
        textResolution: textResolutionFor(zoom)
    };
}

// Round up to quarter steps so small window resizes don't re-render every Text.
export function textResolutionFor (zoom: number): number
{
    return clamp(Math.ceil(zoom * 4) / 4, 1, MAX_TEXT_RESOLUTION);
}

export function sameViewport (a: Viewport | undefined, b: Viewport): boolean
{
    return !!a &&
        a.canvasWidth === b.canvasWidth &&
        a.canvasHeight === b.canvasHeight &&
        a.pixelRatio === b.pixelRatio &&
        a.cssWidth === b.cssWidth &&
        a.cssHeight === b.cssHeight;
}

function clamp (v: number, min: number, max: number): number
{
    return Math.min(max, Math.max(min, v));
}
