import { GameObjects, Geom, Math as PMath } from 'phaser';
import { CardInspector } from '../cards/CardInspector';
import { CardView } from '../cards/CardView';
import { CARD_H, CARD_W } from '../cards/drawCard';
import { cameraFx, createBursts, vibrate, type Bursts } from '../cards/effects';
import { PALETTE, RARITY_STYLE } from '../cards/model';
import { REVEAL_FX } from '../cards/revealFx';
import { ensureFxTextures, ensureTableBackground, FX, releaseFaceTextures, textureScaleFor } from '../cards/textures';
import { EventBus } from '../EventBus';
import { PackOpenEvents, type CardRevealedPayload, type PackShowPayload } from '../events';
import { DESIGN_WIDTH, type Viewport } from '../layout';
import { revealHint, summaryText } from '../pack/packModel';
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

const TAP_SLOP = 14;
const DEPTH = { cards: 10, fx: 1000, inspect: 2000 };

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
    private inspector: CardInspector;
    private bursts: Bursts;
    private lingering: GameObjects.Particles.ParticleEmitter[] = [];

    private cards: CardView[] = [];
    private dealing = false;
    private flipsInFlight = 0;
    private completed = false;
    private topDepth = DEPTH.cards;
    private gesture: Gesture | null = null;

    constructor ()
    {
        super('PackOpen');
    }

    protected build ()
    {
        ensureFxTextures(this);
        this.cameras.main.setBackgroundColor(PALETTE.bg);
        this.background = this.add.image(0, 0, ensureTableBackground(this));

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

        this.inspector = new CardInspector(this, DEPTH.inspect);
        this.bursts = createBursts(this, DEPTH.fx);

        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        this.listen(EventBus, PackOpenEvents.Show, this.onShow);
        this.events.once('shutdown', () => this.clearPack());

        EventBus.emit(PackOpenEvents.Ready);
    }

    protected layout (vp: Viewport)
    {
        coverVisible(this.background, vp);
        this.inspector.layout(vp);

        const grid = textureScaleFor(vp.zoom);
        for (const card of this.cards)
        {
            if (card !== this.inspector.active)
            {
                card.setTextureScale(grid);
            }
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
        const dealt = cards.slice(0, SLOTS.length);

        this.cards = dealt.map((card, i) =>
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
                    if (i === dealt.length - 1)
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
        this.inspector?.reset();
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
        if (this.inspector.active)
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

        if (this.inspector.active)
        {
            this.inspector.close(this.viewport.zoom);
            return;
        }
        if (!g || g.flipped || !g.startCard || g.startCard.state !== 'up')
        {
            return;
        }
        const moved = Math.hypot(p.worldX - g.x, p.worldY - g.y);
        if (moved <= TAP_SLOP && g.startCard.containsWorldPoint(p.worldX, p.worldY))
        {
            this.inspector.open(g.startCard, this.viewport.zoom);
        }
    }

    private flipUnder (p: Phaser.Input.Pointer)
    {
        if (this.dealing || this.inspector.active || !this.gesture)
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
        if (this.dealing || this.inspector.active)
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

        this.bursts.play(card.rarity, view.x, view.y);
        cameraFx(this, card.rarity);
        if (fx.linger)
        {
            this.lingering.push(this.addLinger(view));
        }
        vibrate(fx.vibrate);

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
        this.summary.setText(summaryText(cards));
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
        this.hint.setText(revealHint(up, this.cards.length));
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
}
