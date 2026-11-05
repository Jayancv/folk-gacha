import { useState } from 'react';
import type { OwnedCard } from '../../api/cards';
import { NO_FILTERS } from '../collection/filters';
import { useCollection } from '../collection/useCollection';
import { PickGrid } from '../trades/PickGrid';
import { errorOf } from '../trades/useTrades';
import { formatRule, lineupCountText, multiplierText, pickBlock, pointsByCard, tournamentErrorText, type Tournament } from './tournamentModel';
import { useEnterTournament, useLineupPreview } from './useTournaments';

interface Props
{
    tournament: Tournament;
    /** Your saved lineup (empty if you haven't entered). */
    entered: OwnedCard[];
    onClose: () => void;
    onSaved: () => void;
}

// Picking a lineup: 1 card up to the format's slots, best first. Whenever at least one
// card is picked the server scores it (preview), and Save enters it. The server checks
// everything again on save.
export function LineupPicker ({ tournament: t, entered, onClose, onSaved }: Props)
{
    const [picked, setPicked] = useState<OwnedCard[]>(entered);
    const mine = useCollection({ ...NO_FILTERS, sort: 'score' });
    const slots = t.format.slots;
    const ready = picked.length > 0;
    const ids = picked.map(c => c.id);
    const preview = useLineupPreview(t.id, ids, ready);
    const save = useEnterTournament(t.id);
    const enteredIds = entered.map(c => c.id);
    const points = ready && !preview.isError ? pointsByCard(preview.data) : new Map();
    const previewError = ready && preview.isError ? tournamentErrorText(errorOf(preview.error).code, errorOf(preview.error).message) : null;
    const saveError = save.isError ? tournamentErrorText(errorOf(save.error).code, errorOf(save.error).message) : null;

    const toggle = (card: OwnedCard) =>
    {
        save.reset();
        setPicked(p => (p.some(c => c.id === card.id) ? p.filter(c => c.id !== card.id) : p.length < slots ? [...p, card] : p));
    };
    const note = (card: OwnedCard) =>
    {
        const p = points.get(card.id);
        return p ? `${p.points} pts${p.multiplier !== 1 ? ` ${multiplierText(p.multiplier)}` : ''}` : null;
    };

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#170e10] text-[#f6eadc]" role="dialog" aria-modal="true" aria-label={`Lineup for ${t.name}`}>
            <header className="border-b border-[#3b2529] px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <button onClick={onClose} aria-label="Cancel" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 active:bg-white/10">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                    <div className="mr-auto min-w-0">
                        <p className="truncate text-[11px] tracking-wider text-[#bba595] uppercase">{t.name} · {t.format.name}</p>
                        <h2 className="truncate font-serif text-lg font-bold">Pick your lineup</h2>
                    </div>
                </div>
                <p className="mx-auto mt-2 max-w-xl text-xs text-[#bba595]">{formatRule(t.format, t.element)}</p>
            </header>

            <div data-scroll-root className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
                <div className="mx-auto max-w-xl">
                    <PickGrid
                        query={mine}
                        picked={ids}
                        max={slots}
                        onPick={toggle}
                        empty="No cards yet. Open your daily pack first."
                        blocked={c => pickBlock(c, t, picked, enteredIds)}
                        note={note}
                        numbered
                    />
                </div>
            </div>

            <footer className="border-t border-[#3b2529] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <div className="mr-auto min-w-0" aria-live="polite">
                        {saveError || previewError ? (
                            <p role="alert" className="text-xs text-rose-300">{saveError ?? previewError}</p>
                        ) : ready ? (
                            <p className="text-sm">
                                <span className="text-xs text-[#bba595]">{lineupCountText(picked.length, slots)} · </span>
                                {preview.data ? (
                                    <>
                                        <span className="font-bold text-[#e7b54a]">{preview.data.total} pts</span>
                                        {preview.data.bonus > 0 && <span className="text-xs text-[#bba595]"> · incl. +{preview.data.bonusPercent}% bonus</span>}
                                    </>
                                ) : (
                                    <span className="text-xs text-[#bba595]">Scoring…</span>
                                )}
                            </p>
                        ) : (
                            <p className="text-xs text-[#bba595]">{lineupCountText(picked.length, slots)}</p>
                        )}
                    </div>
                    <button
                        onClick={() => save.mutate(ids, { onSuccess: onSaved })}
                        disabled={!ready || save.isPending || previewError !== null}
                        className="rounded-full bg-[#e7b54a] px-5 py-2.5 text-sm font-bold text-[#170e10] active:scale-95 disabled:opacity-40"
                    >
                        {save.isPending ? 'Saving…' : entered.length > 0 ? 'Save lineup' : 'Enter'}
                    </button>
                </div>
            </footer>
        </div>
    );
}
