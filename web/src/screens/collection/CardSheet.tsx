import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { OwnedCard } from '../../api/cards';
import { RARITY_STYLE } from '../../game/cards/model';
import { CardImage } from './CardImage';
import { acquiredText, copyText, setNumberText } from './cardDetails';
import { ELEMENT_LABEL } from './filters';

// One card, large, with its details. Closes on the backdrop, the button, or Escape.
// Portalled to <body> so it covers the tab bar and the player chip, not just the collection.
export function CardSheet ({ card, onClose }: { card: OwnedCard; onClose: () => void })
{
    const close = useRef<HTMLButtonElement>(null);

    useEffect(() =>
    {
        // preventScroll: focusing the button would otherwise scroll the card out of view on short screens.
        close.current?.focus({ preventScroll: true });
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const rarity = RARITY_STYLE[card.rarity];
    const setNo = setNumberText(card);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={card.name}
                onClick={e => e.stopPropagation()}
                className="max-h-full w-full max-w-sm overflow-y-auto rounded-t-2xl border border-[#3b2529] bg-[#1c1215] p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:rounded-2xl"
            >
                <div className="mx-auto w-3/5 min-w-44">
                    {/* Eager: the sheet is a fixed overlay, outside the grid's scroll root. */}
                    <CardImage card={card} eager />
                </div>

                <h2 className="mt-4 font-serif text-lg leading-tight font-bold">{card.name}</h2>
                <p className="text-sm text-[#bba595]">{card.nameSi}</p>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-[#bba595]">Rarity</dt>
                    <dd style={{ color: rarity.color }} className="font-bold">{rarity.label}</dd>
                    <dt className="text-[#bba595]">Element</dt>
                    <dd>{ELEMENT_LABEL[card.element]}</dd>
                    <dt className="text-[#bba595]">Level</dt>
                    <dd className="text-[#e7b54a]" aria-label={`${card.level} of 5`}>{'★'.repeat(card.level)}<span className="text-white/20">{'★'.repeat(5 - card.level)}</span></dd>
                    <dt className="text-[#bba595]">Score</dt>
                    <dd className="font-bold">{card.score}</dd>
                    {setNo && (
                        <>
                            <dt className="text-[#bba595]">Set number</dt>
                            <dd>{setNo}</dd>
                        </>
                    )}
                    <dt className="text-[#bba595]">Copy</dt>
                    <dd>{copyText(card)}</dd>
                </dl>

                {card.lore && <p className="mt-3 text-sm text-[#bba595] italic">{card.lore}</p>}
                <p className="mt-2 text-xs text-[#bba595]">{acquiredText(card)}</p>

                <button
                    ref={close}
                    onClick={onClose}
                    className="mt-4 w-full rounded-xl bg-[#e7b54a] py-3 text-sm font-bold text-[#170e10] active:scale-[0.98]"
                >
                    Close
                </button>
            </div>
        </div>,
        document.body
    );
}
