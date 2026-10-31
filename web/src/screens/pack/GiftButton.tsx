import type { GiftError } from '../../api/game';
import { giftButtonText, giftErrorText } from './dailyPack';

/** Trade gifts waiting on the Pack tab, and how to open them. */
export interface GiftsWaiting
{
    waiting: number;
    opening: boolean;
    error: GiftError | null;
    onOpen: () => void;
}

const BUTTON = 'pointer-events-auto rounded-full px-6 py-3 text-base font-bold shadow-lg active:scale-95 disabled:opacity-60';

// "Open your trade gift": on the pack panel, or under a revealed pack.
export function GiftButton ({ gifts, subtle = false }: { gifts: GiftsWaiting; subtle?: boolean })
{
    return (
        <div className="flex flex-col items-center gap-1">
            <button
                onClick={gifts.onOpen}
                disabled={gifts.opening}
                className={`${BUTTON} ${subtle ? 'border border-[#e7b54a]/70 bg-[#1c1215]/90 text-[#e7b54a]' : 'bg-[#e7b54a] text-[#170e10]'}`}
            >
                <span aria-hidden="true">🎁 </span>{gifts.opening ? 'Opening…' : giftButtonText(gifts.waiting)}
            </button>
            {gifts.error && <p role="alert" className="pointer-events-auto text-xs text-rose-300">{giftErrorText(gifts.error)}</p>}
        </div>
    );
}

// Under revealed gifts: back to the pack table.
export function GiftDoneButton ({ onDone }: { onDone: () => void })
{
    return (
        <button onClick={onDone} className={`${BUTTON} bg-[#e7b54a] text-[#170e10]`}>
            Done
        </button>
    );
}
