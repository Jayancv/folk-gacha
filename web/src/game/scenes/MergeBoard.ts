import { GameObjects, Geom, Math as PMath, type Types } from 'phaser';
import { CardInspector } from '../cards/CardInspector';
import { CardView } from '../cards/CardView';
import { cameraFx, createBursts, floatText, shockwave, vibrate, type Bursts } from '../cards/effects';
import { PALETTE, RARITY_STYLE, type CardData } from '../cards/model';
import {
    BOARD_SCALE,
    BOARD_SIZE,
    boardHint,
    CELL_H,
    CELL_W,
    FAILURE_TEXT,
    isLevelUpMatch,
    mergeLabel,
    SLOTS,
    slotAt
} from '../merge/boardModel';
import { prefersReducedMotion } from '../cards/revealFx';
import { ensureFxTextures, ensureTableBackground, FX, releaseFaceTextures, textureScaleFor } from '../cards/textures';
import { EventBus } from '../EventBus';
import {
    MergeBoardEvents,
    type BoardShowPayload,
    type MergeFailure,
    type MergeRequestedPayload,
    type MergeResultPayload
} from '../events';
import { DESIGN_WIDTH, type Viewport } from '../layout';

export { BOARD_SIZE };
import { coverVisible, ResponsiveScene } from '../ResponsiveScene';

const DRAG_SLOP = 10;
const LIFT_SCALE = BOARD_SCALE * 1.12;
const HOVER_SCALE = BOARD_SCALE * 1.06;
// The charge-up always lasts at least this long so fast answers still feel deliberate.
const MIN_CHARGE_MS = 650;
const RESULT_TIMEOUT_MS = 8000;
const MATCH_TINT = 0xffd66e;
const DEPTH = { slots: 5, cards: 10, dragging: 900, merge: 950, fx: 1000, inspect: 2000 };

interface Drag
{
    card: CardView;
    fromSlot: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    started: boolean;
}

interface Charging
{
    a: CardView;
    b: CardView;
    cx: number;
    cy: number;
    start: number;
    emitter: GameObjects.Particles.ParticleEmitter;
}

// Merge board: drag a card onto another to merge them.
// Phaser only reports "merge A with B" (MergeRequested) and plays a charge-up
// until React answers with the server's result (MergeResult). It never decides
// whether a merge works or what it makes. Only the public level-up rule (same card,
// same level) is highlighted; recipes stay hidden until discovered.
export class MergeBoard extends ResponsiveScene
{
    private background: GameObjects.Image;
    private hint: GameObjects.Text;
    private slotGraphics: GameObjects.Graphics;
    private inspector: CardInspector;
    private bursts: Bursts;

    private slots: (CardView | null)[] = new Array(BOARD_SIZE).fill(null);
    private drag: Drag | null = null;
    private hover: CardView | null = null;
    private merging = false;
    private charging: Charging | null = null;
    private pending = new Map<string, (r: MergeResultPayload) => void>();
    private requestSeq = 0;
    private total = 0;

    constructor ()
    {
        super('MergeBoard');
    }

    protected build ()
    {
        ensureFxTextures(this);
        this.cameras.main.setBackgroundColor(PALETTE.bg);
        this.background = this.add.image(0, 0, ensureTableBackground(this));

        this.add.text(DESIGN_WIDTH / 2, 104, 'Merge Board', {
            fontFamily: 'Georgia, serif', fontStyle: 'bold', fontSize: 52, color: PALETTE.gold
        }).setOrigin(0.5);

        this.hint = this.add.text(DESIGN_WIDTH / 2, 162, '', {
            fontFamily: 'system-ui, sans-serif', fontSize: 24, color: PALETTE.muted, align: 'center'
        }).setOrigin(0.5);

        this.slotGraphics = this.add.graphics().setDepth(DEPTH.slots);
        this.drawSlots();

        this.inspector = new CardInspector(this, DEPTH.inspect);
        this.bursts = createBursts(this, DEPTH.fx);

        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('pointerupoutside', this.onPointerUp, this);

        this.listen(EventBus, MergeBoardEvents.Show, this.onShow);
        this.listen(EventBus, MergeBoardEvents.MergeResult, this.onMergeResult);
        this.events.once('shutdown', () => this.clearBoard());

        EventBus.emit(MergeBoardEvents.Ready);
    }

    protected layout (vp: Viewport)
    {
        coverVisible(this.background, vp);
        this.inspector.layout(vp);
        for (const card of this.slots)
        {
            if (card && card !== this.inspector.active)
            {
                card.setTextureScale(this.boardTextureScale());
            }
        }
    }

    update (time: number)
    {
        if (this.charging)
        {
            this.animateCharge(time);
        }
    }

    // ---------- Board ----------

    private onShow ({ cards, total }: BoardShowPayload)
    {
        this.clearBoard();
        this.total = total;

        cards.slice(0, BOARD_SIZE).forEach((card, i) =>
        {
            const view = this.placeCard(card, i);
            view.setScale(BOARD_SCALE * 0.6).setAlpha(0);
            this.tweens.add({ targets: view, scale: BOARD_SCALE, alpha: 1, delay: i * 35, duration: 260, ease: 'Back.easeOut' });
        });
        this.updateHint();
    }

    private placeCard (card: CardData, slot: number): CardView
    {
        const { x, y } = SLOTS[slot];
        const view = new CardView(this, card, x, y, this.boardTextureScale(), true)
            .setScale(BOARD_SCALE)
            .setDepth(DEPTH.cards);
        this.slots[slot] = view;
        return view;
    }

    private clearBoard ()
    {
        for (const view of this.slots)
        {
            if (view)
            {
                this.destroyCard(view);
            }
        }
        this.slots.fill(null);
        this.stopCharging();
        this.drag = null;
        this.hover = null;
        this.merging = false;
        // Anything still waiting resolves as a network failure.
        for (const [requestId, resolve] of this.pending)
        {
            resolve({ requestId, ok: false, error: 'network' });
        }
        this.pending.clear();
        this.inspector?.reset();
    }

    private destroyCard (view: CardView)
    {
        view.destroy();
        releaseFaceTextures(this, view.card);
    }

    private drawSlots ()
    {
        const g = this.slotGraphics;
        g.clear();
        for (const { x, y } of SLOTS)
        {
            g.fillStyle(0x000000, 0.22);
            g.fillRoundedRect(x - CELL_W / 2, y - CELL_H / 2, CELL_W, CELL_H, 12);
            g.lineStyle(2, 0xe7b54a, 0.14);
            g.strokeRoundedRect(x - CELL_W / 2, y - CELL_H / 2, CELL_W, CELL_H, 12);
        }
    }

    private updateHint ()
    {
        this.hint.setText(boardHint(this.slots.filter(Boolean).length, this.total));
    }

    private boardTextureScale (): number
    {
        return textureScaleFor(this.viewport.zoom * BOARD_SCALE);
    }

    private slotOf (view: CardView): number
    {
        return this.slots.indexOf(view);
    }

    private cardAt (x: number, y: number, exclude?: CardView): CardView | null
    {
        const hits = this.slots.filter((c): c is CardView => !!c && c !== exclude && c.containsWorldPoint(x, y));
        return hits.sort((a, b) => b.depth - a.depth)[0] ?? null;
    }

    // ---------- Input ----------

    private onPointerDown (p: Phaser.Input.Pointer)
    {
        if (this.inspector.active || this.merging)
        {
            return;
        }
        const card = this.cardAt(p.worldX, p.worldY);
        if (!card)
        {
            return;
        }
        this.drag = {
            card,
            fromSlot: this.slotOf(card),
            startX: p.worldX,
            startY: p.worldY,
            offsetX: card.x - p.worldX,
            offsetY: card.y - p.worldY,
            lastX: p.worldX,
            started: false
        };
    }

    private onPointerMove (p: Phaser.Input.Pointer)
    {
        const drag = this.drag;
        if (!drag || !p.isDown)
        {
            return;
        }
        if (!drag.started)
        {
            if (Math.hypot(p.worldX - drag.startX, p.worldY - drag.startY) < DRAG_SLOP)
            {
                return;
            }
            this.startDrag(drag);
        }

        // Lift the card slightly above the finger so it isn't hidden under it.
        const card = drag.card;
        card.setPosition(p.worldX + drag.offsetX, p.worldY + drag.offsetY - 16);
        const tilt = PMath.Clamp((p.worldX - drag.lastX) * 0.8, -14, 14);
        card.setAngle(card.angle + (tilt - card.angle) * 0.35);
        drag.lastX = p.worldX;

        this.setHover(this.cardAt(p.worldX, p.worldY, card));
    }

    private onPointerUp (p: Phaser.Input.Pointer)
    {
        if (this.inspector.active)
        {
            this.inspector.close(this.viewport.zoom);
            return;
        }
        const drag = this.drag;
        this.drag = null;
        if (!drag)
        {
            return;
        }
        if (!drag.started)
        {
            this.inspector.open(drag.card, this.viewport.zoom);
            return;
        }
        this.drop(drag, p);
    }

    private startDrag (drag: Drag)
    {
        drag.started = true;
        drag.card.setDepth(DEPTH.dragging);
        this.tweens.add({ targets: drag.card, scale: LIFT_SCALE, duration: 110, ease: 'Quad.easeOut' });
        vibrate(6);

        // Show which cards would level up. Recipe partners stay hidden.
        for (const other of this.slots)
        {
            if (other && isLevelUpMatch(drag.card.card, other.card))
            {
                other.setGlow(0.9, MATCH_TINT, true);
            }
        }
    }

    private setHover (target: CardView | null)
    {
        if (target === this.hover)
        {
            return;
        }
        const drag = this.drag;
        if (this.hover)
        {
            const prev = this.hover;
            const isMatch = !!drag && isLevelUpMatch(drag.card.card, prev.card);
            prev.setGlow(isMatch ? 0.9 : 0, MATCH_TINT, isMatch);
            this.tweens.add({ targets: prev, scale: BOARD_SCALE, duration: 120 });
        }
        this.hover = target;
        if (target)
        {
            const isMatch = !!drag && isLevelUpMatch(drag.card.card, target.card);
            target.setGlow(1, isMatch ? MATCH_TINT : 0xffffff);
            this.tweens.add({ targets: target, scale: HOVER_SCALE, duration: 120 });
        }
    }

    private clearHighlights ()
    {
        for (const view of this.slots)
        {
            view?.setGlow(0);
        }
    }

    private drop (drag: Drag, p: Phaser.Input.Pointer)
    {
        const target = this.hover;
        this.setHover(null);
        this.clearHighlights();

        if (target)
        {
            this.merge(drag.card, target);
            return;
        }

        const slot = slotAt(p.worldX, p.worldY);
        if (slot >= 0 && !this.slots[slot])
        {
            // Rearranging is purely visual, so it stays on the client.
            this.slots[drag.fromSlot] = null;
            this.slots[slot] = drag.card;
            this.settle(drag.card, slot);
            return;
        }
        this.settle(drag.card, drag.fromSlot);
    }

    private settle (card: CardView, slot: number, duration = 260): Promise<void>
    {
        return this.tweenAsync({
            targets: card, x: SLOTS[slot].x, y: SLOTS[slot].y, scale: BOARD_SCALE, angle: 0,
            duration, ease: 'Back.easeOut'
        }).then(() => { card.setDepth(DEPTH.cards); });
    }

    // ---------- Merge ----------

    private async merge (a: CardView, b: CardView)
    {
        this.merging = true;
        const aSlot = this.slotOf(a);
        const bSlot = this.slotOf(b);
        const requestId = `merge-${Date.now()}-${++this.requestSeq}`;

        // Snap onto the target.
        a.setDepth(DEPTH.merge + 1);
        b.setDepth(DEPTH.merge);
        vibrate(12);
        await this.tweenAsync({ targets: a, x: b.x + 16, y: b.y - 12, angle: 6, scale: BOARD_SCALE * 1.04, duration: 120, ease: 'Back.easeOut' });

        const payload: MergeRequestedPayload = { requestId, cardIds: [a.card.id, b.card.id] };
        const answer = this.waitForResult(requestId);
        EventBus.emit(MergeBoardEvents.MergeRequested, payload);

        this.startCharging(a, b, SLOTS[bSlot].x, SLOTS[bSlot].y);
        const [result] = await Promise.all([answer, this.delay(MIN_CHARGE_MS)]);
        const center = this.charging ? { x: this.charging.cx, y: this.charging.cy } : SLOTS[bSlot];
        this.stopCharging();

        // The board may have been cleared (scene switch) while waiting.
        if (!a.active || !b.active)
        {
            this.merging = false;
            return;
        }

        if (result.ok)
        {
            await this.playSuccess(a, b, aSlot, bSlot, center, result);
        }
        else
        {
            await this.playFailure(a, b, aSlot, bSlot, result.error);
        }
        this.merging = false;
    }

    private waitForResult (requestId: string): Promise<MergeResultPayload>
    {
        return new Promise(resolve =>
        {
            this.pending.set(requestId, resolve);
            this.time.delayedCall(RESULT_TIMEOUT_MS, () =>
            {
                if (this.pending.delete(requestId))
                {
                    resolve({ requestId, ok: false, error: 'network' });
                }
            });
        });
    }

    private onMergeResult (result: MergeResultPayload)
    {
        const resolve = this.pending.get(result.requestId);
        if (resolve)
        {
            this.pending.delete(result.requestId);
            resolve(result);
        }
    }

    private startCharging (a: CardView, b: CardView, cx: number, cy: number)
    {
        a.fadeGlow(1, 700, 0xffffff);
        b.fadeGlow(1, 700, 0xffffff);

        // Energy motes drawn in towards the cards.
        const emitter = this.add.particles(cx, cy, FX.dot, {
            frequency: 28,
            lifespan: 480,
            scale: { start: 0.1, end: 0.32 },
            alpha: { start: 0, end: 1 },
            moveToX: 0,
            moveToY: 0,
            tint: [0xffe08a, 0xffffff],
            blendMode: 'ADD',
            emitZone: { type: 'edge', source: new Geom.Circle(0, 0, 210), quantity: 36 }
        }).setDepth(DEPTH.fx);

        this.charging = { a, b, cx, cy, start: this.time.now, emitter };
    }

    // The two cards orbit each other, tightening and speeding up while waiting.
    private animateCharge (time: number)
    {
        const c = this.charging!;
        const t = (time - c.start) / 1000;
        const calm = prefersReducedMotion();
        const radius = calm ? 10 : Math.max(8, 30 - t * 22);
        const theta = t * (7 + t * 6);
        const dx = Math.cos(theta) * radius;
        const dy = Math.sin(theta) * radius * 0.45;
        const wobble = calm ? 0 : Math.sin(theta * 2) * 5;
        const pulse = BOARD_SCALE * (1.04 + 0.025 * Math.sin(t * 28));

        c.a.setPosition(c.cx + dx, c.cy + dy).setAngle(wobble).setScale(pulse);
        c.b.setPosition(c.cx - dx, c.cy - dy).setAngle(-wobble).setScale(pulse);
    }

    private stopCharging ()
    {
        if (!this.charging)
        {
            return;
        }
        this.charging.emitter.stop();
        const emitter = this.charging.emitter;
        this.time.delayedCall(600, () => emitter.destroy());
        this.charging = null;
    }

    private async playSuccess (
        a: CardView, b: CardView, aSlot: number, bSlot: number,
        center: { x: number; y: number },
        result: Extract<MergeResultPayload, { ok: true }>
    )
    {
        const { card, discovered } = result;
        const tint = RARITY_STYLE[card.rarity].glow ?? MATCH_TINT;

        // Collapse both inputs into the centre.
        await this.tweenAsync({ targets: [a, b], x: center.x, y: center.y, scale: BOARD_SCALE * 0.15, alpha: 0, angle: 0, duration: 150, ease: 'Back.easeIn' });
        this.destroyCard(a);
        this.destroyCard(b);
        this.slots[aSlot] = null;
        this.slots[bSlot] = null;

        shockwave(this, center.x, center.y, tint, DEPTH.fx, 640);
        this.bursts.play(card.rarity, center.x, center.y, 1.2);
        cameraFx(this, card.rarity);
        if (!prefersReducedMotion())
        {
            this.cameras.main.shake(140, 0.003);
        }
        vibrate([15, 30, 25]);

        // The result pops out, shows off, then settles into the target's slot.
        const view = this.placeCard(card, bSlot);
        view.setPosition(center.x, center.y).setScale(0).setDepth(DEPTH.merge);
        view.setGlow(1, tint, true);

        const label = mergeLabel(result);
        const color = card.rarity === 'common' ? PALETTE.gold : RARITY_STYLE[card.rarity].color;
        floatText(this, center.x, center.y - CELL_H * 0.7, label, color, discovered ? 44 : 40);

        await this.tweenAsync({ targets: view, scale: BOARD_SCALE * 1.35, duration: 280, ease: 'Back.easeOut' });
        await this.delay(discovered ? 700 : 380);
        await this.settle(view, bSlot, 320);
        this.time.delayedCall(900, () => view.active && view.setGlow(0));
        this.updateHint();
    }

    private async playFailure (a: CardView, b: CardView, aSlot: number, bSlot: number, error: MergeFailure)
    {
        a.setGlow(0);
        b.setGlow(0);
        vibrate(30);
        floatText(this, SLOTS[bSlot].x, SLOTS[bSlot].y - CELL_H * 0.6, FAILURE_TEXT[error], PALETTE.muted, 32);

        // Push apart: the dragged card springs home, the target shakes its head.
        const home = this.settle(a, aSlot, 420);
        b.setY(SLOTS[bSlot].y);
        const shake = new Promise<void>(resolve =>
        {
            const x0 = SLOTS[bSlot].x;
            this.tweens.addCounter({
                from: 0, to: 1, duration: 360,
                onUpdate: (tw) =>
                {
                    const t = tw.getValue() ?? 0;
                    b.setX(x0 + Math.sin(t * Math.PI * 6) * 10 * (1 - t)).setAngle(0).setScale(BOARD_SCALE);
                },
                onComplete: () =>
                {
                    b.setPosition(x0, SLOTS[bSlot].y).setDepth(DEPTH.cards);
                    resolve();
                }
            });
        });
        await Promise.all([home, shake]);
    }

    // ---------- Helpers ----------

    private tweenAsync (config: Types.Tweens.TweenBuilderConfig): Promise<void>
    {
        return new Promise(resolve => this.tweens.add({ ...config, onComplete: () => resolve() }));
    }

    private delay (ms: number): Promise<void>
    {
        return new Promise(resolve => this.time.delayedCall(ms, resolve));
    }
}
