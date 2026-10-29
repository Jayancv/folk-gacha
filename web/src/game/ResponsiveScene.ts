import { GameObjects, Scene, Scenes } from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, type Viewport } from './layout';
import { getViewport, LAYOUT_CHANGE } from './scale';

// Base class for every game scene that draws something.
//
// - Author positions in design space (0..DESIGN_WIDTH, 0..DESIGN_HEIGHT, portrait).
//   The camera zooms and centers it so the safe area is always on screen.
// - Text objects are rendered at the camera's device-pixel resolution automatically.
// - Build objects in `build()` (called from create). Override `layout(vp)` to place
//   things relative to the visible area (backgrounds, edge-anchored HUD); it runs
//   right after build() and again on every resize.
// - Subclasses that override init() must call super.init() first.
export abstract class ResponsiveScene extends Scene
{
    protected viewport: Viewport;
    private built = false;

    protected abstract build (): void;

    protected layout (_vp: Viewport): void
    {
    }

    init (_data?: object)
    {
        this.built = false;
        this.viewport = getViewport(this.game);

        this.events.on(Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
        this.game.events.on(LAYOUT_CHANGE, this.applyViewport, this);
        this.events.once(Scenes.Events.SHUTDOWN, () =>
        {
            this.events.off(Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
            this.game.events.off(LAYOUT_CHANGE, this.applyViewport, this);
        });

        this.applyCamera(this.viewport);
    }

    create ()
    {
        this.build();
        this.built = true;
        this.layout(this.viewport);
    }

    private onAdded (obj: GameObjects.GameObject)
    {
        if (obj instanceof GameObjects.Text)
        {
            obj.setResolution(this.viewport.textResolution);
        }
    }

    private applyViewport (vp: Viewport)
    {
        const previous = this.viewport;
        this.viewport = vp;

        this.applyCamera(vp);

        if (previous.textResolution !== vp.textResolution)
        {
            this.updateTextResolution(this.children.list, vp.textResolution);
        }

        if (this.built)
        {
            this.layout(vp);
        }
    }

    private applyCamera (vp: Viewport)
    {
        const cam = this.cameras.main;
        cam.setSize(vp.canvasWidth, vp.canvasHeight);
        cam.setZoom(vp.zoom);
        cam.centerOn(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
    }

    private updateTextResolution (objects: GameObjects.GameObject[], resolution: number)
    {
        for (const obj of objects)
        {
            if (obj instanceof GameObjects.Text)
            {
                obj.setResolution(resolution);
            }
            else if (obj instanceof GameObjects.Container)
            {
                this.updateTextResolution(obj.list, resolution);
            }
        }
    }
}

// Scale an image to cover the visible area (like CSS background-size: cover).
export function coverVisible (image: GameObjects.Image, vp: Viewport): void
{
    const { x, y, width, height } = vp.visible;
    const scale = Math.max(width / image.width, height / image.height);
    image.setPosition(x + width / 2, y + height / 2).setScale(scale);
}
