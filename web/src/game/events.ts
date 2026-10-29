import type { CardData } from './cards/model';

// Event names and payloads exchanged with React over EventBus.
// React owns data (API calls); Phaser only animates and reports gestures.
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
