import type { CardData } from '../../game/cards/model';
import { spiritName } from '../../tutorial/tutorialModel';

// On a Board opened with "Merge": which card it's showing first, and a way back to the newest cards.
export function BoardFocusChip ({ card, onClear }: { card: CardData; onClear: () => void })
{
    const name = spiritName(card);
    return (
        <button
            onClick={onClear}
            aria-label={`Showing ${name} level ${card.level} and its matches first. Show the newest cards instead`}
            className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full border border-[#e7b54a]/60 bg-[#22151a]/95 py-1.5 pr-2 pl-3 text-xs font-bold text-[#e7b54a] active:scale-95"
        >
            <span className="truncate">{name}</span>
            <span aria-hidden="true">{'★'.repeat(card.level)}</span>
            <span aria-hidden="true" className="ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[#bba595]">✕</span>
        </button>
    );
}
