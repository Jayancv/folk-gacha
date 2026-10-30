import { useState } from 'react';
import { CardImage } from '../collection/CardImage';
import { NO_FILTERS } from '../collection/filters';
import { useCollection } from '../collection/useCollection';
import { MAX_SHOWCASE, pickerCountText, togglePick } from './profileModel';

interface Props
{
    /** The showcase as it is now (ids, in order). */
    initial: string[];
    saving: boolean;
    error: string | null;
    onSave: (cardIds: string[]) => void;
    onCancel: () => void;
}

// Pick up to 5 of your cards for your profile, best first. Tap order is display order.
export function ShowcasePicker ({ initial, saving, error, onSave, onCancel }: Props)
{
    const [picked, setPicked] = useState<string[]>(initial);
    const cards = useCollection({ ...NO_FILTERS, sort: 'score' });
    const list = cards.data?.pages.flatMap(p => p.cards) ?? [];

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#170e10] text-[#f6eadc]" role="dialog" aria-modal="true" aria-label="Edit showcase">
            <header className="border-b border-[#3b2529] px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <div className="mr-auto">
                        <h2 className="font-serif text-lg font-bold">Edit showcase</h2>
                        <p className="text-xs text-[#bba595]" aria-live="polite">{pickerCountText(picked.length)}</p>
                    </div>
                    <button onClick={onCancel} className="text-sm text-[#bba595] underline">Cancel</button>
                    <button
                        onClick={() => onSave(picked)}
                        disabled={saving}
                        className="rounded-full bg-[#e7b54a] px-4 py-2 text-sm font-bold text-[#170e10] active:scale-95 disabled:opacity-60"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
                {error && <p role="alert" className="mx-auto mt-2 max-w-xl text-xs text-rose-300">{error}</p>}
            </header>

            <div data-scroll-root className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
                <div className="mx-auto max-w-xl">
                    {cards.isPending ? (
                        <p className="py-16 text-center text-sm text-[#bba595]">Loading your cards…</p>
                    ) : list.length === 0 ? (
                        <p className="py-16 text-center text-sm text-[#bba595]">No cards yet. Open your daily pack first.</p>
                    ) : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {list.map(card =>
                            {
                                const at = picked.indexOf(card.id);
                                const full = picked.length >= MAX_SHOWCASE && at < 0;
                                return (
                                    <li key={card.id}>
                                        <button
                                            onClick={() => setPicked(togglePick(picked, card.id))}
                                            aria-pressed={at >= 0}
                                            aria-label={`${card.name}, level ${card.level}${at >= 0 ? `, showcase position ${at + 1}` : ''}`}
                                            className={`relative block w-full rounded-[6%] transition ${at >= 0 ? 'ring-3 ring-[#e7b54a]' : ''} ${full ? 'opacity-50' : ''}`}
                                        >
                                            <CardImage card={card} />
                                            {at >= 0 && (
                                                <span className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-[#e7b54a] text-sm font-bold text-[#170e10] shadow">
                                                    {at + 1}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {cards.hasNextPage && (
                        <button
                            onClick={() => void cards.fetchNextPage()}
                            disabled={cards.isFetchingNextPage}
                            className="mx-auto mt-4 block text-sm text-[#e7b54a] underline"
                        >
                            {cards.isFetchingNextPage ? 'Loading…' : 'Show more cards'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
