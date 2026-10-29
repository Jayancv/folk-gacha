import { GameObjects } from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, type Viewport } from '../layout';
import { ResponsiveScene } from '../ResponsiveScene';

// Shows the safe area and scaling numbers. Enable with ?debug in the URL.
export class DebugOverlay extends ResponsiveScene
{
    private safeArea: GameObjects.Rectangle;
    private info: GameObjects.Text;

    constructor ()
    {
        super('DebugOverlay');
    }

    protected build ()
    {
        this.safeArea = this.add.rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT)
            .setStrokeStyle(2, 0xff00ff);

        this.info = this.add.text(0, 0, '', {
            fontFamily: 'monospace', fontSize: 18, color: '#ffffff',
            backgroundColor: '#000000aa', padding: { x: 8, y: 6 }
        });

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) =>
        {
            this.info.setText(`${this.describe(this.viewport)}\ntap: ${Math.round(p.worldX)}, ${Math.round(p.worldY)}`);
        });
    }

    protected layout (vp: Viewport)
    {
        this.scene.bringToTop();
        this.safeArea.setStrokeStyle(2 / vp.zoom * vp.pixelRatio, 0xff00ff);
        this.info.setPosition(vp.visible.x + 8, vp.visible.y + 8).setText(this.describe(vp));
    }

    private describe (vp: Viewport)
    {
        return [
            `css ${vp.cssWidth}x${vp.cssHeight}  dpr ${window.devicePixelRatio} (used ${vp.pixelRatio})`,
            `canvas ${vp.canvasWidth}x${vp.canvasHeight}  zoom ${vp.zoom.toFixed(3)}`,
            `visible ${Math.round(vp.visible.width)}x${Math.round(vp.visible.height)}  text res ${vp.textResolution}`
        ].join('\n');
    }
}
