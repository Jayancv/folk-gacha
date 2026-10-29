import type { GameObjects, Scene } from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, type Viewport } from '../layout';
import type { CardView } from './CardView';
import { CARD_H, CARD_W } from './drawCard';
import { textureScaleFor } from './textures';

// Inspected card fills most of the safe area.
export const INSPECT_SCALE = Math.min((DESIGN_WIDTH - 80) / CARD_W, (DESIGN_HEIGHT - 280) / CARD_H);
const INSPECT_Y = DESIGN_HEIGHT / 2 - 10;

interface Home
{
    x: number;
    y: number;
    scale: number;
    depth: number;
}

// Tap-to-inspect: dims the table and brings one card up large, re-rendering its
// texture at the larger size so text stays sharp. Any tap closes it.
export class CardInspector
{
    private dim: GameObjects.Rectangle;
    private card: CardView | null = null;
    private home: Home | null = null;

    constructor (private scene: Scene, private depth: number)
    {
        // Interactive so it blocks taps on objects underneath.
        this.dim = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.78)
            .setOrigin(0).setDepth(depth).setVisible(false).setInteractive();
    }

    get active (): CardView | null
    {
        return this.card;
    }

    layout (vp: Viewport): void
    {
        this.dim.setPosition(vp.visible.x, vp.visible.y).setSize(vp.visible.width, vp.visible.height);
        // Rectangle input area doesn't follow setSize automatically.
        this.dim.input?.hitArea.setTo(0, 0, vp.visible.width, vp.visible.height);
        this.card?.setTextureScale(textureScaleFor(vp.zoom * INSPECT_SCALE));
    }

    open (card: CardView, zoom: number): void
    {
        if (this.card)
        {
            return;
        }
        this.card = card;
        this.home = { x: card.x, y: card.y, scale: card.scaleX, depth: card.depth };

        card.setTextureScale(textureScaleFor(zoom * INSPECT_SCALE)).setDepth(this.depth + 1);
        this.dim.setVisible(true).setAlpha(0);
        this.scene.tweens.add({ targets: this.dim, alpha: 1, duration: 220 });
        this.scene.tweens.add({
            targets: card, x: DESIGN_WIDTH / 2, y: INSPECT_Y, scale: INSPECT_SCALE,
            duration: 320, ease: 'Cubic.easeOut'
        });
    }

    close (zoom: number, onClosed?: () => void): void
    {
        const card = this.card;
        const home = this.home;
        if (!card || !home)
        {
            return;
        }
        this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: 200, onComplete: () => this.dim.setVisible(false) });
        this.scene.tweens.add({
            targets: card, x: home.x, y: home.y, scale: home.scale, duration: 260, ease: 'Cubic.easeInOut',
            onComplete: () =>
            {
                card.setDepth(home.depth).setTextureScale(textureScaleFor(zoom * home.scale));
                this.card = null;
                this.home = null;
                onClosed?.();
            }
        });
    }

    // Drop state without animating, e.g. when the table is cleared.
    reset (): void
    {
        this.card = null;
        this.home = null;
        this.dim.setVisible(false);
    }
}
