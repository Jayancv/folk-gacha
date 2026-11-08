import { GameObjects, Geom, Math as PMath, type Time, type Types } from 'phaser';
import * as sfx from '../../audio/sfx';
import { CardInspector } from '../cards/CardInspector';
import { CardView } from '../cards/CardView';
import { CARD_H, CARD_W } from '../cards/drawCard';
import { cameraFx, createBursts, floatText, shockwave, vibrate, type Bursts } from '../cards/effects';
import { PALETTE, RARITY_STYLE, type CardData } from '../cards/model';
import {
    BOARD_SCALE,
    BOARD_SIZE,
    boardHint,
    CELL_H,
    CELL_W,
    edgeScrollSpeed,
    FAILURE_TEXT,
    GRID_TOP,
    isLevelUpMatch,
    LOCK_BADGE,
    LOCK_FAILURE,
    maxScroll,
    type BoardLock,
    mergeLabel,
    RESULT_TIMEOUT_MS,
    ROW_H,
    slotAt,
    slotCountFor,
    slotPosition
} from '../merge/boardModel';
import { prefersReducedMotion } from '../cards/revealFx';
import { ensureFxTextures, ensureTableBackground, FX, releaseFaceTextures, textureScaleFor } from '../cards/textures';
import { EventBus } from '../../bridge/EventBus';
import {
    MergeBoardEvents,
    type BoardShowPayload,
    type MergeFailure,
    type MergeRequestedPayload,
    type MergeResultPayload
} from '../../bridge/events';
import { DESIGN_WIDTH, type Viewport } from '../layout';

export { BOARD_SIZE };
import { coverVisible, ResponsiveScene } from '../ResponsiveScene';

const DRAG_SLOP = 10;
// On touch, a swipe scrolls the board; holding a card this long picks it up.
const HOLD_MS = 180;
const LIFT_SCALE = BOARD_SCALE * 1.12;
const HOVER_SCALE = BOARD_SCALE * 1.06;
// The charge-up always lasts at least this long so fast answers still feel deliberate.
const MIN_CHARGE_MS = 650;
const MATCH_TINT = 0xffd66e;
// A locked card under a dragged one: a dull glow, it won't take it.
const LOCKED_TINT = 0x8a7f78;
const DEPTH = { slots: 5, cards: 10, header: 60, hint: 70, dragging: 900, merge: 950, fx: 1000, inspect: 2000 };
// The React tab bar covers the bottom of the canvas (CSS px).
const TAB_BAR_CSS = 92;
// Cards made per frame after the first screen, so a big board never freezes.
const CARDS_PER_FRAME = 6;
// Fling: per-frame (16.7 ms) decay of the scroll speed after a swipe.
const FLING_DECAY = 0.94;
// How far a picked-up card must move before the edges scroll the board (design units).
const EDGE_ARM_DISTANCE = 60;

interface Drag
{
    card: CardView;
    fromSlot: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    /** Where the finger is (design space), for scrolling at the edges. */
    pointerX: number;
    pointerY: number;
    /** Where it was picked up: the edges scroll only once the card has moved away from there. */
    startX: number;
    startY: number;
    edgeArmed: boolean;
}

// A touch or click on the board until it becomes a tap, a scroll or a drag.
interface Gesture
{
    card: CardView | null;
    touch: boolean;
    mode: 'pending' | 'scroll' | 'drag';
    startX: number;
    startY: number;
    startScroll: number;
    lastY: number;
    lastTime: number;
    hold: Time.TimerEvent | null;
}

interface Charging
{
    a: CardView;
    b: CardView;
    cx: number;
    cy: number;
    start: number;
    emitter: GameObjects.Particles.ParticleEmitter;
    /** Stops the charging hum. */
    stopHum: () => void;
}

// Merge board: drag a card onto another to merge them.
// Phaser only reports "merge A with B" (MergeRequested) and plays a charge-up
// until React answers with the server's result (MergeResult). It never decides
// whether a merge works or what it makes. Only the public level-up rule (same card,
// same level) is highlighted; recipes stay hidden until discovered.
// The board scrolls: a swipe moves it, holding a card picks it up (a mouse drags at once
// and scrolls with the wheel), and a card dragged near the top or bottom scrolls it.
export class MergeBoard extends ResponsiveScene
{
    private background: GameObjects.Image;
    // The table's top strip, drawn over cards scrolled up under the hint.
    private header: GameObjects.Image;
    private hint: GameObjects.Text;
    private slotGraphics: GameObjects.Graphics;
    private inspector: CardInspector;
    private bursts: Bursts;

    private slots: (CardView | null)[] = new Array(BOARD_SIZE).fill(null);
    // Cards still to be made (a few per frame), and the slots they will take.
    private queue: { card: CardData; slot: number }[] = [];
    private reserved = new Set<number>();
    // Cards tweening to their slot: scrolling leaves them alone and they snap when done.
    private settling = new Set<CardView>();
    private scroll = 0;
    private scrollMax = 0;
    private velocity = 0;
    private gesture: Gesture | null = null;
    private drag: Drag | null = null;
    private hover: CardView | null = null;
    private merging = false;
    private charging: Charging | null = null;
    private pending = new Map<string, (r: MergeResultPayload) => void>();
    private requestSeq = 0;
    private total = 0;
    // Cards offered in an open trade or entered in a tournament: dimmed, labelled, can't merge.
    private locks = new Map<string, BoardLock>();
    // Opened with "Merge" on this card: its matches glow, also those made later.
    private focusCard: CardData | null = null;

    constructor ()
    {
        super('MergeBoard');
    }

    protected build ()
    {
        ensureFxTextures(this);
        this.cameras.main.setBackgroundColor(PALETTE.bg);
        const table = ensureTableBackground(this);
        this.background = this.add.image(0, 0, table);
        this.header = this.add.image(0, 0, table).setDepth(DEPTH.header);

        // No title: the React Board / List switch sits at the top (screens/collection/CardsViewSwitch).
        this.hint = this.add.text(DESIGN_WIDTH / 2, 162, '', {
            fontFamily: 'system-ui, sans-serif', fontSize: 24, color: PALETTE.muted, align: 'center'
        }).setOrigin(0.5).setDepth(DEPTH.hint);

        this.slotGraphics = this.add.graphics().setDepth(DEPTH.slots);

        this.inspector = new CardInspector(this, DEPTH.inspect);
        this.bursts = createBursts(this, DEPTH.fx);

        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('pointerupoutside', this.onPointerUp, this);
        this.input.on('wheel', this.onWheel, this);

        this.onBridge(MergeBoardEvents.Show, this.onShow);
        this.onBridge(MergeBoardEvents.MergeResult, this.onMergeResult);
        this.events.once('shutdown', () => this.clearBoard());

        EventBus.emit(MergeBoardEvents.Ready);
    }

    protected layout (vp: Viewport)
    {
        coverVisible(this.background, vp);
        // The header strip is the same picture, cut off just above the first row.
        coverVisible(this.header, vp);
        const imageTop = this.header.y - this.header.displayHeight / 2;
        this.header.setCrop(0, 0, this.header.width, Math.max(0, (GRID_TOP - 8 - imageTop) / this.header.scaleY));

        this.inspector.layout(vp);
        for (const card of this.slots)
        {
            if (card && card !== this.inspector.active)
            {
                card.setTextureScale(this.boardTextureScale());
            }
        }
        this.updateScrollRange();
    }

    update (time: number, delta: number)
    {
        if (this.charging)
        {
            this.animateCharge(time);
        }
        const frames = delta / 16.7;

        // A dragged card near the top or bottom edge scrolls the board under it.
        if (this.drag?.edgeArmed && !this.merging)
        {
            const speed = edgeScrollSpeed(this.drag.pointerY, GRID_TOP, this.viewBottom());
            if (speed !== 0 && this.setScroll(this.scroll + speed * frames))
            {
                this.setHover(this.cardAt(this.drag.pointerX, this.drag.pointerY, this.drag.card));
            }
        }
        // Fling after a swipe.
        else if (!this.gesture && this.velocity !== 0)
        {
            const moved = this.setScroll(this.scroll + this.velocity * delta);
            this.velocity *= Math.pow(FLING_DECAY, frames);
            if (!moved || Math.abs(this.velocity) < 0.02)
            {
                this.velocity = 0;
            }
        }

        // The rest of a big board, a few cards per frame.
        for (let i = 0; i < CARDS_PER_FRAME && this.queue.length > 0; i++)
        {
            const { card, slot } = this.queue.shift()!;
            this.reserved.delete(slot);
            this.createCard(card, slot);
        }
    }

    // ---------- Board ----------

    private onShow ({ cards, total, locked = [], inEvent = [], focusId }: BoardShowPayload)
    {
        // A reload keeps the scroll; opening on a card starts at the top, where it is.
        const keepScroll = focusId ? 0 : this.scroll;
        this.clearBoard();
        this.total = total;
        const inEvents = new Set(inEvent);
        this.locks = new Map(locked.map(id => [id, inEvents.has(id) ? 'tournament' : 'trade']));
        this.slots = new Array(slotCountFor(cards.length)).fill(null);
        this.updateScrollRange();
        this.scroll = PMath.Clamp(keepScroll, 0, this.scrollMax);
        this.focusCard = cards.find(c => c.id === focusId) ?? null;

        // What's on screen pops in now; the rest is made over the next frames.
        const firstOffscreen = (Math.floor(this.scroll / ROW_H) + Math.ceil(this.viewHeight() / ROW_H) + 1) * 4;
        cards.forEach((card, i) =>
        {
            if (i >= firstOffscreen)
            {
                this.queue.push({ card, slot: i });
                this.reserved.add(i);
                return;
            }
            const view = this.createCard(card, i);
            view.setScale(BOARD_SCALE * 0.6).setAlpha(0);
            this.tweens.add({ targets: view, scale: BOARD_SCALE, alpha: 1, delay: (i % 16) * 35, duration: 260, ease: 'Back.easeOut' });
        });
        this.drawSlots();
        this.updateHint(this.showFocus());
    }

    // Opened with "Merge" on a card: it glows white and its level-up matches pulse gold,
    // until the first drag clears the highlights. Returns what the hint should say about it.
    private showFocus (): { name: string; matches: number } | undefined
    {
        const focus = this.focusCard;
        const view = this.slots.find(v => v?.card.id === focus?.id);
        if (!focus || !view)
        {
            return undefined;
        }
        view.setGlow(1, 0xffffff);
        const cards = [...this.slots.filter((v): v is CardView => !!v).map(v => v.card), ...this.queue.map(q => q.card)];
        const matches = cards.filter(c => this.canMatch(focus, c)).length;
        return { name: focus.season?.title ?? focus.name, matches };
    }

    // Makes a card's view in its slot, with the highlights it should have right now.
    private createCard (card: CardData, slot: number): CardView
    {
        const view = this.placeCard(card, slot);
        const against = this.drag?.card.card ?? this.focusCard;
        if (against && this.canMatch(against, card))
        {
            view.setGlow(0.9, MATCH_TINT, true);
        }
        this.cull(view, slot);
        return view;
    }

    private placeCard (card: CardData, slot: number): CardView
    {
        const { x, y } = this.pos(slot);
        const view = new CardView(this, card, x, y, this.boardTextureScale(), true)
            .setScale(BOARD_SCALE)
            .setDepth(DEPTH.cards);
        const lock = this.locks.get(card.id);
        if (lock)
        {
            view.add(this.lockLayer(lock));
        }
        this.slots[slot] = view;
        return view;
    }

    // A locked card is dimmed with a banner across it ("🔒 In trade" / "🏆 In tournament"),
    // so players can see at a glance which cards to leave alone. It moves with the card.
    private lockLayer (lock: BoardLock): GameObjects.GameObject[]
    {
        const dim = this.add.graphics();
        dim.fillStyle(0x0b0608, 0.5);
        dim.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, (6 * CARD_W) / 100);
        const band = this.add.graphics();
        band.fillStyle(0x000000, 0.82);
        band.fillRect(-CARD_W / 2, -26, CARD_W, 52);
        band.lineStyle(2, lock === 'trade' ? 0xe7b54a : 0x8fc7ff, 0.9);
        band.lineBetween(-CARD_W / 2, -26, CARD_W / 2, -26);
        band.lineBetween(-CARD_W / 2, 26, CARD_W / 2, 26);
        const text = this.add.text(0, 0, LOCK_BADGE[lock], {
            fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: 22,
            color: lock === 'trade' ? PALETTE.gold : '#bfe0ff'
        }).setOrigin(0.5);
        return [dim, band, text];
    }

    /** The level-up rule, leaving out cards locked in a trade or tournament. */
    private canMatch (a: CardData, b: CardData): boolean
    {
        return isLevelUpMatch(a, b) && !this.locks.has(a.id) && !this.locks.has(b.id);
    }

    // A locked card was picked up or dropped on: say why, without asking the server.
    private refuseLocked (view: CardView)
    {
        const lock = this.locks.get(view.card.id) ?? 'trade';
        vibrate(30);
        sfx.play('mergeFail');
        floatText(this, view.x, view.y - CELL_H * 0.6, FAILURE_TEXT[LOCK_FAILURE[lock]], PALETTE.muted, 32);
        this.tweens.add({ targets: view, x: { from: view.x - 8, to: view.x }, duration: 260, ease: 'Elastic.easeOut' });
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
        this.queue = [];
        this.reserved.clear();
        this.settling.clear();
        this.stopCharging();
        this.gesture?.hold?.remove();
        this.gesture = null;
        this.drag = null;
        this.hover = null;
        this.merging = false;
        this.velocity = 0;
        this.focusCard = null;
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
        this.settling.delete(view);
        view.destroy();
        releaseFaceTextures(this, view.card);
    }

    private drawSlots ()
    {
        const g = this.slotGraphics;
        g.clear();
        const { y: top, height } = this.viewport.visible;
        for (let i = 0; i < this.slots.length; i++)
        {
            const { x, y } = this.pos(i);
            if (y + CELL_H / 2 < top || y - CELL_H / 2 > top + height)
            {
                continue;
            }
            g.fillStyle(0x000000, 0.22);
            g.fillRoundedRect(x - CELL_W / 2, y - CELL_H / 2, CELL_W, CELL_H, 12);
            g.lineStyle(2, 0xe7b54a, 0.14);
            g.strokeRoundedRect(x - CELL_W / 2, y - CELL_H / 2, CELL_W, CELL_H, 12);
        }
    }

    private updateHint (focus?: { name: string; matches: number })
    {
        const shown = this.slots.filter(Boolean).length + this.queue.length;
        this.hint.setText(boardHint(shown, this.total, focus));
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
        // Nothing under the header strip can be picked.
        if (y < GRID_TOP - 8)
        {
            return null;
        }
        const hits = this.slots.filter((c): c is CardView => !!c && c !== exclude && c.visible && c.containsWorldPoint(x, y));
        return hits.sort((a, b) => b.depth - a.depth)[0] ?? null;
    }

    // ---------- Scrolling ----------

    /** A slot's centre on screen right now (design space). */
    private pos (slot: number): { x: number; y: number }
    {
        const p = slotPosition(slot);
        return { x: p.x, y: p.y - this.scroll };
    }

    /** The bottom of the board's view: above the React tab bar. */
    private viewBottom (): number
    {
        const vp = this.viewport;
        return vp.visible.y + vp.visible.height - (TAB_BAR_CSS * vp.pixelRatio) / vp.zoom;
    }

    private viewHeight (): number
    {
        return this.viewBottom() - GRID_TOP;
    }

    private updateScrollRange ()
    {
        if (!this.slotGraphics)
        {
            return;
        }
        this.scrollMax = maxScroll(this.slots.length, this.viewBottom());
        this.setScroll(this.scroll, true);
    }

    /** Scrolls the board (clamped). True if it moved. */
    private setScroll (next: number, force = false): boolean
    {
        const clamped = PMath.Clamp(next, 0, this.scrollMax);
        if (clamped === this.scroll && !force)
        {
            return false;
        }
        this.scroll = clamped;
        this.slots.forEach((view, i) =>
        {
            if (!view || view === this.drag?.card || view === this.inspector.active || this.settling.has(view))
            {
                return;
            }
            const { x, y } = this.pos(i);
            view.setPosition(x, y);
            this.cull(view, i);
        });
        this.drawSlots();
        return true;
    }

    // Cards far off screen aren't drawn.
    private cull (view: CardView, slot: number)
    {
        const { y: top, height } = this.viewport.visible;
        const { y } = this.pos(slot);
        view.setVisible(y + CELL_H / 2 > top && y - CELL_H / 2 < top + height);
    }

    private onWheel (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number)
    {
        if (this.drag || this.merging || this.inspector.active)
        {
            return;
        }
        this.velocity = 0;
        this.setScroll(this.scroll + (dy * this.viewport.pixelRatio) / this.viewport.zoom);
    }

    // ---------- Input ----------

    private onPointerDown (p: Phaser.Input.Pointer)
    {
        if (this.inspector.active || this.merging)
        {
            return;
        }
        this.velocity = 0; // a touch stops a fling
        const card = this.cardAt(p.worldX, p.worldY);
        const gesture: Gesture = {
            card,
            touch: p.wasTouch,
            mode: 'pending',
            startX: p.worldX,
            startY: p.worldY,
            startScroll: this.scroll,
            lastY: p.worldY,
            lastTime: p.downTime,
            hold: null
        };
        // Touch: holding still on a card picks it up; moving first scrolls instead.
        if (card && gesture.touch)
        {
            gesture.hold = this.time.delayedCall(HOLD_MS, () =>
            {
                if (this.gesture === gesture && gesture.mode === 'pending')
                {
                    this.beginDrag(gesture, p.worldX, p.worldY);
                }
            });
        }
        this.gesture = gesture;
    }

    private onPointerMove (p: Phaser.Input.Pointer)
    {
        const g = this.gesture;
        if (!g || !p.isDown)
        {
            return;
        }
        if (g.mode === 'pending')
        {
            if (Math.hypot(p.worldX - g.startX, p.worldY - g.startY) < DRAG_SLOP)
            {
                return;
            }
            g.hold?.remove();
            if (g.card && !g.touch)
            {
                this.beginDrag(g, g.startX, g.startY); // a mouse drags at once
            }
            else
            {
                g.mode = 'scroll';
            }
        }

        if (g.mode === 'scroll')
        {
            if (!this.merging)
            {
                this.setScroll(g.startScroll - (p.worldY - g.startY));
            }
            const dt = Math.max(1, p.moveTime - g.lastTime);
            this.velocity = (g.lastY - p.worldY) / dt;
            g.lastY = p.worldY;
            g.lastTime = p.moveTime;
            return;
        }

        const drag = this.drag;
        if (!drag)
        {
            return;
        }
        // Lift the card slightly above the finger so it isn't hidden under it.
        const card = drag.card;
        card.setPosition(p.worldX + drag.offsetX, p.worldY + drag.offsetY - 16);
        const tilt = PMath.Clamp((p.worldX - drag.lastX) * 0.8, -14, 14);
        card.setAngle(card.angle + (tilt - card.angle) * 0.35);
        drag.lastX = p.worldX;
        drag.pointerX = p.worldX;
        drag.pointerY = p.worldY;
        // Picking up a card in the top or bottom row must not scroll by itself.
        drag.edgeArmed ||= Math.hypot(p.worldX - drag.startX, p.worldY - drag.startY) > EDGE_ARM_DISTANCE;

        this.setHover(this.cardAt(p.worldX, p.worldY, card));
    }

    private onPointerUp (p: Phaser.Input.Pointer)
    {
        if (this.inspector.active)
        {
            this.inspector.close(this.viewport.zoom);
            return;
        }
        const g = this.gesture;
        this.gesture = null;
        if (!g)
        {
            return;
        }
        g.hold?.remove();
        if (g.mode === 'pending')
        {
            this.velocity = 0;
            if (g.card)
            {
                this.inspector.open(g.card, this.viewport.zoom);
            }
            return;
        }
        if (g.mode === 'scroll')
        {
            // A finger that stopped before lifting doesn't fling.
            if (p.upTime - g.lastTime > 80)
            {
                this.velocity = 0;
            }
            return;
        }
        const drag = this.drag;
        this.drag = null;
        if (drag)
        {
            this.drop(drag, p);
        }
    }

    private beginDrag (g: Gesture, x: number, y: number)
    {
        if (!g.card || this.merging)
        {
            return;
        }
        if (this.locks.has(g.card.card.id))
        {
            g.mode = 'scroll';
            this.refuseLocked(g.card);
            return;
        }
        g.mode = 'drag';
        this.velocity = 0;
        const card = g.card;
        this.focusCard = null;
        this.clearHighlights();
        this.drag = {
            card,
            fromSlot: this.slotOf(card),
            offsetX: card.x - x,
            offsetY: card.y - y,
            lastX: x,
            pointerX: x,
            pointerY: y,
            startX: x,
            startY: y,
            edgeArmed: false
        };
        card.setDepth(DEPTH.dragging);
        this.tweens.add({ targets: card, scale: LIFT_SCALE, duration: 110, ease: 'Quad.easeOut' });
        vibrate(6);
        sfx.play('pickup');

        // Show which cards would level up. Recipe partners stay hidden.
        for (const other of this.slots)
        {
            if (other && this.canMatch(card.card, other.card))
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
            const isMatch = !!drag && this.canMatch(drag.card.card, prev.card);
            prev.setGlow(isMatch ? 0.9 : 0, MATCH_TINT, isMatch);
            this.tweens.add({ targets: prev, scale: BOARD_SCALE, duration: 120 });
        }
        this.hover = target;
        if (target && this.locks.has(target.card.id))
        {
            target.setGlow(0.7, LOCKED_TINT); // can't take it: no lift
        }
        else if (target)
        {
            const isMatch = !!drag && this.canMatch(drag.card.card, target.card);
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

        if (target && this.locks.has(target.card.id))
        {
            this.refuseLocked(target);
            this.settle(drag.card, drag.fromSlot);
            return;
        }
        if (target)
        {
            this.merge(drag.card, target);
            return;
        }

        const slot = slotAt(p.worldX, p.worldY, this.scroll, this.slots.length);
        if (slot >= 0 && !this.slots[slot] && !this.reserved.has(slot))
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
        this.settling.add(card);
        const { x, y } = this.pos(slot);
        return this.tweenAsync({
            targets: card, x, y, scale: BOARD_SCALE, angle: 0,
            duration, ease: 'Back.easeOut'
        }).then(() =>
        {
            this.settling.delete(card);
            const at = this.slotOf(card);
            if (card.active && at >= 0)
            {
                // The board may have scrolled meanwhile.
                const now = this.pos(at);
                card.setPosition(now.x, now.y).setDepth(DEPTH.cards);
                this.cull(card, at);
            }
        });
    }

    // ---------- Merge ----------

    private async merge (a: CardView, b: CardView)
    {
        this.merging = true;
        this.velocity = 0;
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

        const target = this.pos(bSlot);
        this.startCharging(a, b, target.x, target.y);
        const [result] = await Promise.all([answer, this.delay(MIN_CHARGE_MS)]);
        const center = this.charging ? { x: this.charging.cx, y: this.charging.cy } : this.pos(bSlot);
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

        this.charging = { a, b, cx, cy, start: this.time.now, emitter, stopHum: sfx.startCharge() };
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
        this.charging.stopHum();
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
        sfx.play(result.kind === 'level_up' ? 'levelUp' : discovered ? 'discover' : 'recipe');
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
        // Two cards in, one out: the player owns one card fewer.
        this.total = Math.max(this.slots.filter(Boolean).length, this.total - 1);
        this.updateHint();
    }

    private async playFailure (a: CardView, b: CardView, aSlot: number, bSlot: number, error: MergeFailure)
    {
        a.setGlow(0);
        b.setGlow(0);
        vibrate(30);
        sfx.play('mergeFail');
        const home = this.pos(bSlot);
        floatText(this, home.x, home.y - CELL_H * 0.6, FAILURE_TEXT[error], PALETTE.muted, 32);

        // Push apart: the dragged card springs home, the target shakes its head.
        const back = this.settle(a, aSlot, 420);
        b.setY(home.y);
        const shake = new Promise<void>(resolve =>
        {
            const x0 = home.x;
            this.tweens.addCounter({
                from: 0, to: 1, duration: 360,
                onUpdate: (tw) =>
                {
                    const t = tw.getValue() ?? 0;
                    b.setX(x0 + Math.sin(t * Math.PI * 6) * 10 * (1 - t)).setAngle(0).setScale(BOARD_SCALE);
                },
                onComplete: () =>
                {
                    b.setPosition(x0, home.y).setDepth(DEPTH.cards);
                    resolve();
                }
            });
        });
        await Promise.all([back, shake]);
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
