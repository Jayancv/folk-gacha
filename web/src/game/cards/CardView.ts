import { BlendModes, GameObjects, Scene, Types } from 'phaser';
import * as sfx from '../../audio/sfx';
import { CardShine } from './CardShine';
import { CARD_H, CARD_W } from './drawCard';
import { RARITY_STYLE, type CardData } from './model';
import { prefersReducedMotion, REVEAL_FX } from './revealFx';
import { ensureBackTexture, ensureFaceTexture, FX } from './textures';

export type CardState = 'down' | 'flipping' | 'up';

// One card on the table: a container (rays, glow, card image) centred on its position.
// Flips by squashing the container on X and swapping the back texture for the face.
export class CardView extends GameObjects.Container
{
    readonly card: CardData;
    state: CardState = 'down';

    private image: GameObjects.Image;
    private glow: GameObjects.Image;
    private rays: GameObjects.Image;
    private shine: CardShine | null = null;
    private textureScale: number;
    private glowPulse?: Phaser.Tweens.Tween;
    private trembleTween?: Phaser.Tweens.Tween;

    constructor (scene: Scene, card: CardData, x: number, y: number, textureScale: number, faceUp = false)
    {
        super(scene, x, y);
        this.card = card;
        this.textureScale = textureScale;
        this.state = faceUp ? 'up' : 'down';

        const tint = RARITY_STYLE[card.rarity].glow ?? 0xffffff;

        this.rays = scene.add.image(0, 0, FX.rays)
            .setTint(tint).setBlendMode(BlendModes.ADD).setAlpha(0).setVisible(false);
        this.glow = scene.add.image(0, 0, FX.glow)
            .setDisplaySize(CARD_W + 88, CARD_H + 88)
            .setTint(tint).setBlendMode(BlendModes.ADD).setAlpha(0);
        this.image = scene.add.image(0, 0, faceUp ? ensureFaceTexture(scene, card, textureScale) : ensureBackTexture(scene, textureScale));

        this.add([this.rays, this.glow, this.image]);
        if (CardShine.wanted(card))
        {
            this.shine = new CardShine(scene, card);
            this.add(this.shine);
        }
        this.fitImage();
        this.setSize(CARD_W, CARD_H);
        scene.add.existing(this);
        if (faceUp)
        {
            this.shine?.start(textureScale);
        }

        this.once(GameObjects.Events.DESTROY, () =>
        {
            this.glowPulse?.remove();
            this.trembleTween?.remove();
            scene.tweens.killTweensOf([this, this.glow, this.rays]);
        });
    }

    // Swap textures to match how large the card is on screen (device px per design unit).
    setTextureScale (scale: number): this
    {
        if (scale === this.textureScale)
        {
            return this;
        }
        this.textureScale = scale;
        this.image.setTexture(this.state === 'up' ? ensureFaceTexture(this.scene, this.card, scale) : ensureBackTexture(this.scene, scale));
        this.fitImage();
        if (this.state === 'up')
        {
            this.shine?.setTextureScale(scale);
        }
        return this;
    }

    // Glow around the card, e.g. to highlight a merge target. `tint` null = rarity colour.
    setGlow (alpha: number, tint: number | null = null, pulse = false): this
    {
        this.glowPulse?.remove();
        this.glowPulse = undefined;
        this.scene.tweens.killTweensOf(this.glow);
        this.glow.setTint(tint ?? RARITY_STYLE[this.card.rarity].glow ?? 0xffffff).setAlpha(alpha);
        if (pulse && alpha > 0)
        {
            this.glowPulse = this.scene.tweens.add({
                targets: this.glow,
                alpha: { from: alpha, to: alpha * 0.4 },
                duration: 700,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
        return this;
    }

    // Fade the glow to `alpha` over `ms` (used while a merge charges up).
    fadeGlow (alpha: number, ms: number, tint: number | null = null): this
    {
        this.setGlow(this.glow.alpha, tint);
        this.scene.tweens.add({ targets: this.glow, alpha, duration: ms, ease: 'Quad.easeIn' });
        return this;
    }

    containsWorldPoint (x: number, y: number): boolean
    {
        const halfW = (CARD_W / 2) * Math.abs(this.scaleX);
        const halfH = (CARD_H / 2) * Math.abs(this.scaleY);
        return Math.abs(x - this.x) <= halfW && Math.abs(y - this.y) <= halfH;
    }

    // Plays anticipation and the flip. `onReveal` fires the moment the face shows,
    // so the scene can add particles and camera effects. Resolves once settled.
    async flip (onReveal: () => void): Promise<void>
    {
        if (this.state !== 'down')
        {
            return;
        }
        this.state = 'flipping';
        const fx = REVEAL_FX[this.card.rarity];
        const calm = prefersReducedMotion();
        const baseY = this.y;

        // Face texture is drawn now, off the critical frame of the swap.
        const faceKey = ensureFaceTexture(this.scene, this.card, this.textureScale);

        if (fx.anticipationMs > 0)
        {
            sfx.playAnticipation(fx.anticipationMs / 1000, this.card.rarity);
            await this.anticipate(fx.anticipationMs, calm ? 0 : fx.tremble);
        }

        // Lift and squash to edge-on
        sfx.play('flip');
        await this.tween({ y: baseY - 14, scaleX: 0, scaleY: 1.08, duration: 140, ease: 'Sine.easeIn' });

        this.image.setTexture(faceKey);
        this.fitImage();
        this.state = 'up';
        onReveal();
        this.showGlow(fx.rays && !calm);

        // Unsquash past full size, then settle
        await this.tween({ scaleX: fx.pop, scaleY: fx.pop, duration: 200, ease: 'Back.easeOut' });
        await this.tween({ y: baseY, scaleX: 1, scaleY: 1, duration: 260, ease: 'Sine.easeInOut' });

        // First glint right after the reveal, then the card shines every few seconds.
        this.shine?.start(this.textureScale, 120);
    }

    private async anticipate (ms: number, tremble: number)
    {
        // Glow builds through the back while the card trembles.
        this.scene.tweens.add({ targets: this.glow, alpha: 0.85, duration: ms, ease: 'Quad.easeIn' });
        this.scene.tweens.add({ targets: this, scaleX: 1.05, scaleY: 1.05, duration: ms, ease: 'Quad.easeIn' });

        if (tremble > 0)
        {
            // One time-based tween: many tiny yoyo repeats would each cost a frame and
            // stretch the build-up on slow devices. The tremble grows towards the flip.
            const x0 = this.x;
            await new Promise<void>(resolve =>
            {
                this.trembleTween = this.scene.tweens.addCounter({
                    from: 0,
                    to: 1,
                    duration: ms,
                    onUpdate: (tw) =>
                    {
                        const t = tw.getValue() ?? 0;
                        const amp = tremble * (0.35 + 0.65 * t);
                        const wobble = Math.sin(t * ms * 0.07); // ~11 Hz
                        this.setX(x0 + wobble * amp).setAngle(wobble * amp * 0.4);
                    },
                    onComplete: () =>
                    {
                        this.setX(x0).setAngle(0);
                        resolve();
                    }
                });
            });
        }
        else
        {
            await this.delay(ms);
        }
    }

    private showGlow (rays: boolean)
    {
        const hasGlow = RARITY_STYLE[this.card.rarity].glow !== null;
        if (!hasGlow)
        {
            this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 200 });
            return;
        }

        this.glow.setAlpha(1);
        this.glowPulse = this.scene.tweens.add({
            targets: this.glow,
            alpha: { from: 0.95, to: 0.45 },
            duration: 1100,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        if (rays)
        {
            this.rays.setVisible(true).setScale(0.4).setAlpha(0);
            this.scene.tweens.add({ targets: this.rays, alpha: 0.75, scale: 1.25, duration: 500, ease: 'Cubic.easeOut' });
            this.scene.tweens.add({ targets: this.rays, angle: 360, duration: 14000, repeat: -1 });
            this.scene.tweens.add({ targets: this.rays, alpha: 0.3, delay: 900, duration: 1200 });
        }
    }

    private fitImage ()
    {
        this.image.setDisplaySize(CARD_W, CARD_H);
    }

    private tween (config: Omit<Types.Tweens.TweenBuilderConfig, 'targets'>): Promise<void>
    {
        return new Promise(resolve =>
        {
            this.scene.tweens.add({ ...config, targets: this, onComplete: () => resolve() });
        });
    }

    private delay (ms: number): Promise<void>
    {
        return new Promise(resolve => this.scene.time.delayedCall(ms, resolve));
    }
}
