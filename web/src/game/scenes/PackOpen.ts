import { GameObjects, Geom, Math as PMath } from 'phaser';
import { CardView } from '../cards/CardView';
import { CARD_H, CARD_W } from '../cards/drawCard';
import { PALETTE, RARITIES, RARITY_STYLE, rarityRank, type Rarity } from '../cards/model';
import { prefersReducedMotion, REVEAL_FX } from '../cards/revealFx';
import { ensureFxTextures, FX, releaseFaceTextures, textureScaleFor } from '../cards/textures';
import { EventBus } from '../EventBus';
import { PackOpenEvents, type CardRevealedPayload, type PackShowPayload } from '../events';
import { DESIGN_HEIGHT, DESIGN_WIDTH, type Viewport } from '../layout';
import { coverVisible, ResponsiveScene } from '../ResponsiveScene';

// Grid: 3 cards on top, 2 below, centred in the safe area.
const GAP = 18;
const GRID_CENTER_Y = 650;
const SLOTS: { x: number; y: number }[] = (() =>
{
    const cx = DESIGN_WIDTH / 2;
    const dx = CARD_W + GAP;
    const top = GRID_CENTER_Y - (CARD_H + GAP) / 2;
    const bottom = GRID_CENTER_Y + (CARD_H + GAP) / 2;
    return [
        { x: cx - dx, y: top }, { x: cx, y: top }, { x: cx + dx, y: top },
        { x: cx - dx / 2, y: bottom }, { x: cx + dx / 2, y: bottom }
    ];
})();

// Inspected card fills most of the safe area.
const INSPECT_SCALE = Math.min((DESIGN_WIDTH - 80) / CARD_W, (DESIGN_HEIGHT - 280) / CARD_H);
const INSPECT_Y = DESIGN_HEIGHT / 2 - 10;

const TAP_SLOP = 14;
const DEPTH = { cards: 10, fx: 1000, dim: 2000, inspected: 2001 };

interface Gesture
{
    x: number;
    y: number;
    startCard: CardView | null;
    flipped: boolean;
}

// Pack opening: deal 5 face-down cards, tap or swipe across them to flip,
// rarity-scaled anticipation, glow, particles and camera effects.
// Cards come from React via EventBus (PackOpenEvents.Show); this scene never decides outcomes.
export class PackOpen extends ResponsiveScene
{
    private background: GameObjects.Image;
    private hint: GameObjects.Text;
    private summary: GameObjects.Text;
    private revealAllButton: GameObjects.Text;
    private dim: GameObjects.Rectangle;

    private bursts = new Map<Rarity, GameObjects.Particles.ParticleEmitter>();
    private sparkles = new Map<Rarity, GameObjects.Particles.ParticleEmitter>();
    private lingering: GameObjects.Particles.ParticleEmitter[] = [];

    private cards: CardView[] = [];
    private dealing = false;
    private flipsInFlight = 0;
    private completed = false;
    private topDepth = DEPTH.cards;
    private gesture: Gesture | null = null;
    private inspecting: CardView | null = null;

    constructor ()
    {
        super('PackOpen');
    }

    protected build ()
    {
        ensureFxTextures(this);
        this.ensureBackground();
        this.cameras.main.setBackgroundColor(PALETTE.bg);

        this.background = this.add.image(0, 0, 'pack-bg');

        this.add.text(DESIGN_WIDTH / 2, 150, 'Daily Pack', {
            fontFamily: 'Georgia, serif', fontStyle: 'bold', fontSize: 56, color: PALETTE.gold
        }).setOrigin(0.5);

        this.hint = this.add.text(DESIGN_WIDTH / 2, 212, '', {
            fontFamily: 'system-ui, sans-serif', fontSize: 26, color: PALETTE.muted
        }).setOrigin(0.5);

        this.summary = this.add.text(DESIGN_WIDTH / 2, 1060, '', {
            fontFamily: 'system-ui, sans-serif', fontSize: 28, color: PALETTE.ink, align: 'center', lineSpacing: 8
        }).setOrigin(0.5);

        this.revealAllButton = this.add.text(DESIGN_WIDTH / 2, 1060, 'Reveal all', {
            fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: 28, color: PALETTE.gold,
            backgroundColor: '#2a1a1f', padding: { x: 28, y: 14 }
        }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
        this.revealAllButton.on('pointerup', () => this.revealAll());

        this.dim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.78)
            .setOrigin(0).setDepth(DEPTH.dim).setVisible(false).setInteractive();

        this.createEmitters();

        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        EventBus.on(PackOpenEvents.Show, this.onShow, this);
        this.events.once('shutdown', () =>
        {
            EventBus.off(PackOpenEvents.Show, this.onShow, this);
            this.clearPack();
        });

        EventBus.emit(PackOpenEvents.Ready);
    }

    protected layout (vp: Viewport)
    {
        coverVisible(this.background, vp);
        this.dim.setPosition(vp.visible.x, vp.visible.y).setSize(vp.visible.width, vp.visible.height);
        // Rectangle input area doesn't follow setSize automatically.
        this.dim.input?.hitArea.setTo(0, 0, vp.visible.width, vp.visible.height);

        const grid = textureScaleFor(vp.zoom);
        for (const card of this.cards)
        {
            card.setTextureScale(card === this.inspecting ? this.inspectTextureScale() : grid);
        }
    }

    // ---------- Dealing ----------

    private onShow ({ cards }: PackShowPayload)
    {
        this.clearPack();
        this.completed = false;
        this.dealing = true;
        this.summary.setText('');
        this.hint.setText('');

        const scale = textureScaleFor(this.viewport.zoom);
        const fromY = this.viewport.visible.y + this.viewport.visible.height + CARD_H;

        this.cards = cards.slice(0, SLOTS.length).map((card, i) =>
        {
            const view = new CardView(this, card, DESIGN_WIDTH / 2, fromY, scale)
                .setDepth(++this.topDepth)
                .setAngle(PMath.Between(-12, 12));
            this.tweens.add({
                targets: view,
                x: SLOTS[i].x,
                y: SLOTS[i].y,
                angle: 0,
                delay: 120 + i * 90,
                duration: 520,
                ease: 'Cubic.easeOut',
                onComplete: () =>
                {
                    if (i === cards.length - 1 || i === SLOTS.length - 1)
                    {
                        this.dealing = false;
                        this.updateHint();
                        this.revealAllButton.setVisible(true);
                    }
                }
            });
            return view;
        });
    }

    private clearPack ()
    {
        for (const card of this.cards)
        {
            card.destroy();
            releaseFaceTextures(this, card.card);
        }
        this.cards = [];
        this.lingering.forEach(e => e.destroy());
        this.lingering = [];
        this.inspecting = null;
        this.dim?.setVisible(false);
        this.revealAllButton?.setVisible(false);
        this.flipsInFlight = 0;
    }

    // ---------- Input: tap or swipe to flip, tap a face-up card to inspect ----------

    private cardAt (x: number, y: number): CardView | null
    {
        // Topmost first
        const hit = this.cards.filter(c => c.containsWorldPoint(x, y));
        return hit.sort((a, b) => b.depth - a.depth)[0] ?? null;
    }

    private onPointerDown (p: Phaser.Input.Pointer)
    {
        if (this.inspecting)
        {
            return;
        }
        this.gesture = { x: p.worldX, y: p.worldY, startCard: this.cardAt(p.worldX, p.worldY), flipped: false };
        this.flipUnder(p);
    }

    private onPointerMove (p: Phaser.Input.Pointer)
    {
        if (p.isDown && this.gesture)
        {
            this.flipUnder(p);
        }
    }

    private onPointerUp (p: Phaser.Input.Pointer)
    {
        const g = this.gesture;
        this.gesture = null;

        if (this.inspecting)
        {
            this.closeInspect();
            return;
        }
        if (!g || g.flipped || !g.startCard || g.startCard.state !== 'up')
        {
            return;
        }
        const moved = Math.hypot(p.worldX - g.x, p.worldY - g.y);
        if (moved <= TAP_SLOP && g.startCard.containsWorldPoint(p.worldX, p.worldY))
        {
            this.inspect(g.startCard);
        }
    }

    private flipUnder (p: Phaser.Input.Pointer)
    {
        if (this.dealing || this.inspecting || !this.gesture)
        {
            return;
        }
        const card = this.cardAt(p.worldX, p.worldY);
        if (card && card.state === 'down')
        {
            this.gesture.flipped = true;
            this.reveal(card);
        }
    }

    private revealAll ()
    {
        if (this.dealing || this.inspecting)
        {
            return;
        }
        this.revealAllButton.setVisible(false);
        this.cards
            .filter(c => c.state === 'down')
            .forEach((card, i) => this.time.delayedCall(i * 280, () => this.reveal(card)));
    }

    // ---------- Reveal ----------

    private async reveal (card: CardView)
    {
        if (card.state !== 'down')
        {
            return;
        }
        card.setDepth(++this.topDepth);
        this.flipsInFlight++;
        await card.flip(() => this.onReveal(card));
        this.flipsInFlight--;
        this.checkComplete();
    }

    private onReveal (view: CardView)
    {
        const { card } = view;
        const fx = REVEAL_FX[card.rarity];
        const calm = prefersReducedMotion();

        this.bursts.get(card.rarity)!.explode(fx.burst, view.x, view.y);
        if (fx.sparkles > 0)
        {
            this.sparkles.get(card.rarity)!.explode(fx.sparkles, view.x, view.y);
        }

        const cam = this.cameras.main;
        if (fx.shake && !calm)
        {
            cam.shake(fx.shake.duration, fx.shake.intensity);
        }
        if (fx.flash && !calm)
        {
            const c = fx.flash.color;
            cam.flash(fx.flash.duration, (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
        }
        if (fx.linger)
        {
            this.lingering.push(this.addLinger(view));
        }

        try
        {
            navigator.vibrate?.(fx.vibrate);
        }
        catch
        {
            // Some browsers throw when vibration isn't allowed yet; haptics are optional.
        }

        this.updateHint();
        const payload: CardRevealedPayload = { index: this.cards.indexOf(view), card };
        EventBus.emit(PackOpenEvents.CardRevealed, payload);
    }

    private checkComplete ()
    {
        if (this.completed || this.flipsInFlight > 0 || this.cards.length === 0 || this.cards.some(c => c.state !== 'up'))
        {
            return;
        }
        this.completed = true;
        this.revealAllButton.setVisible(false);

        const cards = this.cards.map(c => c.card);
        const total = cards.reduce((sum, c) => sum + c.score, 0);
        const best = cards.reduce((a, c) => rarityRank(c.rarity) > rarityRank(a.rarity) || (c.rarity === a.rarity && c.score > a.score) ? c : a);
        this.summary.setText(`Pack value ${total} pts\nBest pull: ${best.name} (${RARITY_STYLE[best.rarity].label})`);
        this.summary.setAlpha(0).setY(1080);
        this.tweens.add({ targets: this.summary, alpha: 1, y: 1060, duration: 400, ease: 'Cubic.easeOut' });
        this.hint.setText('Tap a card to see it up close');

        const payload: PackShowPayload = { cards };
        EventBus.emit(PackOpenEvents.Complete, payload);
    }

    private updateHint ()
    {
        if (this.completed)
        {
            return;
        }
        const up = this.cards.filter(c => c.state === 'up').length;
        this.hint.setText(up === 0 ? 'Tap or swipe across the cards to reveal' : `${up} of ${this.cards.length} revealed`);
    }

    // ---------- Inspect ----------

    private inspectTextureScale (): number
    {
        return textureScaleFor(this.viewport.zoom * INSPECT_SCALE);
    }

    private inspect (card: CardView)
    {
        const index = this.cards.indexOf(card);
        this.inspecting = card;
        card.setTextureScale(this.inspectTextureScale()).setDepth(DEPTH.inspected);
        this.dim.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: this.dim, alpha: 1, duration: 220 });
        this.tweens.add({
            targets: card, x: DESIGN_WIDTH / 2, y: INSPECT_Y, scale: INSPECT_SCALE,
            duration: 320, ease: 'Cubic.easeOut'
        });
        card.setData('home', SLOTS[index]);
    }

    private closeInspect ()
    {
        const card = this.inspecting;
        if (!card)
        {
            return;
        }
        const home = card.getData('home') as { x: number; y: number };
        this.tweens.add({ targets: this.dim, alpha: 0, duration: 200, onComplete: () => this.dim.setVisible(false) });
        this.tweens.add({
            targets: card, x: home.x, y: home.y, scale: 1, duration: 260, ease: 'Cubic.easeInOut',
            onComplete: () =>
            {
                card.setDepth(++this.topDepth).setTextureScale(textureScaleFor(this.viewport.zoom));
                this.inspecting = null;
            }
        });
    }

    // ---------- Effects ----------

    private createEmitters ()
    {
        for (const rarity of RARITIES)
        {
            const tint = RARITY_STYLE[rarity].glow ?? 0xf6eadc;
            const strength = 1 + rarityRank(rarity) * 0.35;

            this.bursts.set(rarity, this.add.particles(0, 0, FX.dot, {
                emitting: false,
                speed: { min: 60 * strength, max: 340 * strength },
                angle: { min: 0, max: 360 },
                lifespan: { min: 450, max: 1000 + rarityRank(rarity) * 200 },
                scale: { start: 0.42, end: 0 },
                alpha: { start: 1, end: 0 },
                gravityY: 260,
                tint,
                blendMode: 'ADD'
            }).setDepth(DEPTH.fx));

            this.sparkles.set(rarity, this.add.particles(0, 0, FX.star, {
                emitting: false,
                speed: { min: 120 * strength, max: 420 * strength },
                angle: { min: 0, max: 360 },
                lifespan: { min: 700, max: 1400 },
                scale: { start: 0.5, end: 0 },
                rotate: { min: 0, max: 180 },
                alpha: { start: 1, end: 0 },
                tint: [tint, 0xffffff],
                blendMode: 'ADD'
            }).setDepth(DEPTH.fx));
        }
    }

    private addLinger (view: CardView)
    {
        const tint = RARITY_STYLE[view.card.rarity].glow ?? 0xffffff;
        const emitter = this.add.particles(0, 0, FX.star, {
            frequency: 160,
            lifespan: 1300,
            speedY: { min: -40, max: -10 },
            speedX: { min: -12, max: 12 },
            scale: { start: 0.28, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: [tint, 0xffffff],
            blendMode: 'ADD',
            emitZone: { type: 'random', source: new Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), quantity: 1 }
        }).setDepth(view.depth + 0.5);
        emitter.startFollow(view);
        return emitter;
    }

    private ensureBackground ()
    {
        if (this.textures.exists('pack-bg'))
        {
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        const g = ctx.createRadialGradient(256, 230, 0, 256, 256, 362);
        g.addColorStop(0, '#3d1d24');
        g.addColorStop(0.55, '#22131a');
        g.addColorStop(1, PALETTE.bg);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
        this.textures.addCanvas('pack-bg', canvas);
    }
}
