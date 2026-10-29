import { BlendModes, GameObjects, Scene } from 'phaser';
import { CARD_H, CARD_W, SHINE } from './drawCard';
import type { CardData } from './model';
import { prefersReducedMotion } from './revealFx';
import { ensureGlintTexture, FX } from './textures';

const SWEEP_MS = 1100;
const BAND_ANGLE = 22;
const GOLD = 0xffe08a;

// A band of light that sweeps across a face-up card now and then. The band is masked
// by the card's glint texture (pattern lines + rim), so only the pattern catches the light.
// Hidden between sweeps, so the mask filter costs nothing while idle.
export class CardShine extends GameObjects.Container
{
    private readonly card: CardData;
    private readonly band: GameObjects.Image;
    private glintKey: string | null = null;
    private timer?: Phaser.Time.TimerEvent;
    private sweep?: Phaser.Tweens.Tween;
    private running = false;

    constructor (scene: Scene, card: CardData)
    {
        super(scene, 0, 0);
        this.card = card;

        const foil = card.season?.art.foil ?? 'none';
        this.band = scene.add.image(0, 0, foil === 'holo' ? FX.shineHolo : FX.shine)
            .setDisplaySize(CARD_W * 0.32, CARD_H * 1.6)
            .setAngle(BAND_ANGLE)
            .setBlendMode(BlendModes.ADD);
        if (foil === 'gold')
        {
            this.band.setTint(GOLD);
        }
        this.add(this.band);

        // Fixed card-sized bounds so the mask lines up with the card, wherever the band is.
        this.setSize(CARD_W, CARD_H);
        this.setBlendMode(BlendModes.ADD);
        this.setVisible(false);

        this.once(GameObjects.Events.DESTROY, () => this.stop());
    }

    /** True if this card has season art to shine. */
    static wanted (card: CardData): boolean
    {
        return !!card.season && !prefersReducedMotion();
    }

    /** Starts the sweep loop using the glint texture at `scale`. */
    start (scale: number, firstDelay?: number): this
    {
        this.setTextureScale(scale);
        if (this.running || !this.glintKey)
        {
            return this;
        }
        this.running = true;
        this.queue(firstDelay ?? this.nextDelay() * 0.5);
        return this;
    }

    stop (): this
    {
        this.running = false;
        this.timer?.remove();
        this.timer = undefined;
        this.sweep?.remove();
        this.sweep = undefined;
        if (this.scene)
        {
            this.setVisible(false);
        }
        return this;
    }

    setTextureScale (scale: number): this
    {
        const key = ensureGlintTexture(this.scene, this.card, scale);
        if (key === this.glintKey)
        {
            return this;
        }
        this.glintKey = key;
        if (!key)
        {
            this.stop();
            return this;
        }
        if (!this.filters)
        {
            this.enableFilters();
        }
        this.filters!.internal.clear();
        this.filters!.internal.addMask(key);
        return this;
    }

    private nextDelay (): number
    {
        const [min, max] = SHINE[this.card.rarity].every;
        return (min + Math.random() * (max - min)) * 1000;
    }

    private queue (ms: number)
    {
        this.timer = this.scene.time.delayedCall(ms, () => this.play());
    }

    private play ()
    {
        if (!this.running)
        {
            return;
        }
        const travel = CARD_W * 1.1;
        this.band.setX(-travel);
        this.setVisible(true).setAlpha(SHINE[this.card.rarity].alpha);
        this.sweep?.remove();
        this.sweep = this.scene.tweens.add({
            targets: this.band,
            x: travel,
            duration: SWEEP_MS,
            ease: 'Sine.easeInOut',
            onComplete: () =>
            {
                this.setVisible(false);
                if (this.running)
                {
                    this.queue(this.nextDelay());
                }
            }
        });
    }
}
