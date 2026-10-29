import type { CardData } from '../game/cards/model';

// The React <-> Phaser contract: every event name, its direction and its payload.
// React owns data (API calls); Phaser only animates and reports gestures.
// Add new events here and to BridgeEvents below; EventBus rejects anything else.
export const PackOpenEvents = {
    /** Phaser → React: the scene is ready for a pack. */
    Ready: 'pack-open:ready',
    /** React → Phaser: deal these cards face down. Payload: PackShowPayload */
    Show: 'pack-open:show',
    /** Phaser → React: a card was revealed. Payload: CardRevealedPayload */
    CardRevealed: 'pack-open:card-revealed',
    /** Phaser → React: every card in the pack is face up. Payload: PackShowPayload */
    Complete: 'pack-open:complete'
} as const;

export interface PackShowPayload
{
    cards: CardData[];
}

export interface CardRevealedPayload
{
    index: number;
    card: CardData;
}

export const MergeBoardEvents = {
    /** Phaser → React: the board is ready for cards. */
    Ready: 'merge-board:ready',
    /** React → Phaser: lay out the player's cards. Payload: BoardShowPayload */
    Show: 'merge-board:show',
    /** Phaser → React: the player dropped card A onto card B. Payload: MergeRequestedPayload */
    MergeRequested: 'merge-board:merge-requested',
    /** React → Phaser: the server's answer. Payload: MergeResultPayload */
    MergeResult: 'merge-board:merge-result'
} as const;

export interface BoardShowPayload
{
    cards: CardData[];
    /** Total cards owned, when more than fit on the board. */
    total: number;
}

export interface MergeRequestedPayload
{
    requestId: string;
    /** [dragged card, target card]. Only ids: the server decides the result. */
    cardIds: [string, string];
}

export type MergeFailure = 'no_recipe' | 'max_level' | 'not_owned' | 'network';

export type MergeResultPayload =
    | {
        requestId: string;
        ok: true;
        card: CardData;
        kind: 'level_up' | 'recipe';
        /** True the first time this player makes this recipe. */
        discovered: boolean;
    }
    | {
        requestId: string;
        ok: false;
        error: MergeFailure;
    };

export type GameScene = 'PackOpen' | 'MergeBoard';

export interface SwitchScenePayload
{
    scene: GameScene;
}

export const GameEvents = {
    /** React → Phaser: show a table scene. Payload: SwitchScenePayload */
    SwitchScene: 'game:switch-scene'
} as const;

/** Payload type for every bridge event (`void` = no payload). */
export interface BridgeEvents
{
    [PackOpenEvents.Ready]: void;
    [PackOpenEvents.Show]: PackShowPayload;
    [PackOpenEvents.CardRevealed]: CardRevealedPayload;
    [PackOpenEvents.Complete]: PackShowPayload;

    [MergeBoardEvents.Ready]: void;
    [MergeBoardEvents.Show]: BoardShowPayload;
    [MergeBoardEvents.MergeRequested]: MergeRequestedPayload;
    [MergeBoardEvents.MergeResult]: MergeResultPayload;

    [GameEvents.SwitchScene]: SwitchScenePayload;
}

export type BridgeEvent = keyof BridgeEvents;
