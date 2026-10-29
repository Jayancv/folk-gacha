import { describe, expect, it } from 'vitest';
import { computeViewport, DESIGN_HEIGHT, DESIGN_WIDTH, MAX_PIXEL_RATIO, MAX_TEXT_RESOLUTION, textResolutionFor } from './layout';

// Device pixels per design unit should be the same on both axes and the safe
// area (0,0)-(DESIGN_WIDTH, DESIGN_HEIGHT) must always be inside `visible`.
function expectSafeAreaVisible (vp: ReturnType<typeof computeViewport>)
{
    expect(vp.visible.x).toBeLessThanOrEqual(0);
    expect(vp.visible.y).toBeLessThanOrEqual(0);
    expect(vp.visible.x + vp.visible.width).toBeGreaterThanOrEqual(DESIGN_WIDTH - 1e-9);
    expect(vp.visible.y + vp.visible.height).toBeGreaterThanOrEqual(DESIGN_HEIGHT - 1e-9);
    expect(vp.visible.width * vp.zoom).toBeCloseTo(vp.canvasWidth);
    expect(vp.visible.height * vp.zoom).toBeCloseTo(vp.canvasHeight);
}

describe('computeViewport', () =>
{
    it('renders an iPhone at native device pixels', () =>
    {
        const vp = computeViewport(390, 844, 3);

        expect(vp.canvasWidth).toBe(1170);
        expect(vp.canvasHeight).toBe(2532);
        // Width-limited: the 720-wide safe area spans the whole 1170px canvas.
        expect(vp.zoom).toBeCloseTo(1170 / 720);
        expect(vp.visible.x).toBeCloseTo(0);
        // Taller than 9:16, so extra world shows above and below.
        expect(vp.visible.y).toBeLessThan(0);
        expectSafeAreaVisible(vp);
    });

    it('pillarboxes a landscape desktop window with extra world at the sides', () =>
    {
        const vp = computeViewport(1920, 1080, 1);

        expect(vp.canvasWidth).toBe(1920);
        expect(vp.zoom).toBeCloseTo(1080 / 1280);
        expect(vp.visible.y).toBeCloseTo(0);
        expect(vp.visible.x).toBeLessThan(0);
        expectSafeAreaVisible(vp);
    });

    it('fits an exact 9:16 screen with no extra space', () =>
    {
        const vp = computeViewport(360, 640, 2);

        expect(vp.zoom).toBeCloseTo(1);
        expect(vp.visible).toEqual({ x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
    });

    it('clamps very high pixel ratios', () =>
    {
        const vp = computeViewport(400, 800, 4.5);

        expect(vp.pixelRatio).toBe(MAX_PIXEL_RATIO);
        expect(vp.canvasWidth).toBe(400 * MAX_PIXEL_RATIO);
    });

    it('treats missing or sub-1 pixel ratios as 1', () =>
    {
        expect(computeViewport(400, 800, 0).pixelRatio).toBe(1);
        expect(computeViewport(400, 800, 0.8).pixelRatio).toBe(1);
    });

    it('keeps fractional pixel ratios (Android, browser zoom)', () =>
    {
        const vp = computeViewport(412, 915, 2.625);

        expect(vp.pixelRatio).toBe(2.625);
        expect(vp.canvasWidth).toBe(Math.round(412 * 2.625));
        expectSafeAreaVisible(vp);
    });

    it('stays finite when the parent has no size yet', () =>
    {
        const vp = computeViewport(0, 0, 2);

        expect(vp.canvasWidth).toBeGreaterThan(0);
        expect(Number.isFinite(vp.zoom)).toBe(true);
        expect(vp.zoom).toBeGreaterThan(0);
    });
});

describe('textResolutionFor', () =>
{
    it('matches device pixels, rounded up to quarter steps', () =>
    {
        expect(textResolutionFor(1170 / 720)).toBe(1.75);
        expect(textResolutionFor(2)).toBe(2);
    });

    it('never goes below 1 or above the cap', () =>
    {
        expect(textResolutionFor(0.5)).toBe(1);
        expect(textResolutionFor(10)).toBe(MAX_TEXT_RESOLUTION);
    });
});
