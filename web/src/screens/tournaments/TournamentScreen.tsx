import { useState } from 'react';
import { toCardData, type OwnedCard } from '../../api/cards';
import type { Me } from '../../auth/useAuth';
import { CardImage } from '../collection/CardImage';
import { CardSheet } from '../collection/CardSheet';
import { errorOf } from '../trades/useTrades';
import { LineupPicker } from './LineupPicker';
import {
    entriesText, formatRule, multiplierText, placeText, pointsByCard, prizeFor, prizesText, statusLine, tournamentErrorText, utcTimeText,
    type TournamentDetail
} from './tournamentModel';
import { useTournament, useWithdrawFromTournament } from './useTournaments';

// One tournament over the Tournament list: its rules, your lineup with the server's score,
// and the results once entries close.
export function TournamentScreen ({ id, me, onClose, onOpenProfile }: { id: string; me: Me; onClose: () => void; onOpenProfile: (username: string) => void })
{
    const detail = useTournament(id);
    const [picking, setPicking] = useState(false);
    const [open, setOpen] = useState<OwnedCard | null>(null);
    const withdraw = useWithdrawFromTournament(id);
    const d = detail.data;
    const t = d?.tournament;
    const lineup = (d?.you?.cards ?? []).flatMap(c => (c.card ? [toCardData(c.card)] : []));

    return (
        <section data-scroll-root className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label={t?.name ?? 'Tournament'}>
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3 backdrop-blur">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <button onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 active:bg-white/10">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M15 5l-7 7 7 7" />
                        </svg>
                    </button>
                    <div className="mr-auto min-w-0">
                        <h1 className="truncate font-serif text-xl font-bold">{t ? `${t.name}: ${t.format.name}` : 'Tournament'}</h1>
                        <p className="truncate text-xs text-[#bba595]">{t ? statusLine(t) : ' '}</p>
                    </div>
                </div>
            </header>

            <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pt-4 pb-32">
                {detail.isPending ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">Loading…</p>
                ) : !d || !t ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">
                        Couldn't load this tournament.{' '}
                        <button className="text-[#e7b54a] underline" onClick={() => void detail.refetch()}>Retry</button>
                    </p>
                ) : (
                    <>
                        <div className="rounded-2xl border border-[#3b2529] bg-[#22151a] p-3 text-sm">
                            <p className="font-bold">{formatRule(t.format, t.element)}</p>
                            <p className="mt-1 text-xs text-[#bba595]">
                                Entries close {utcTimeText(t.closesAt)} · cards free {utcTimeText(t.endsAt)} · {entriesText(t.entries)}
                            </p>
                            {prizesText(t.prizes) && (
                                <p className="mt-1 text-xs text-[#e7b54a]">
                                    <span aria-hidden="true">🎁 </span>Prizes: {prizesText(t.prizes)} (Common or Uncommon, opened on the Pack tab)
                                </p>
                            )}
                            <p className="mt-1 text-xs text-[#bba595]">
                                Entered cards are locked until the end (no merging or trading), and sit out this series' next tournament.
                            </p>
                        </div>

                        <YourEntry
                            detail={d}
                            lineup={lineup}
                            busy={withdraw.isPending}
                            error={withdraw.isError ? tournamentErrorText(errorOf(withdraw.error).code, errorOf(withdraw.error).message) : null}
                            onPick={() => setPicking(true)}
                            onWithdraw={() => withdraw.mutate()}
                            onOpenCard={setOpen}
                        />

                        {t.status !== 'open' && <Results detail={d} me={me} onOpenProfile={onOpenProfile} />}

                        <details className="text-xs text-[#bba595]">
                            <summary className="cursor-pointer">Fair play</summary>
                            <p className="mt-1">
                                The server scores every lineup. Ties are broken by a secret seed fixed when the tournament opened; its
                                fingerprint (SHA-256) is published from the start and the seed is revealed when entries close.
                            </p>
                            {t.seedHash && <p className="mt-1 font-mono break-all">Fingerprint: {t.seedHash}</p>}
                            {t.seed && <p className="mt-1 font-mono break-all">Seed: {t.seed}</p>}
                        </details>
                    </>
                )}
            </div>

            {picking && t && (
                <LineupPicker tournament={t} entered={lineup} onClose={() => setPicking(false)} onSaved={() => setPicking(false)} />
            )}
            {open && <CardSheet card={open} onClose={() => setOpen(null)} />}
        </section>
    );
}

interface EntryProps
{
    detail: TournamentDetail;
    lineup: OwnedCard[];
    busy: boolean;
    error: string | null;
    onPick: () => void;
    onWithdraw: () => void;
    onOpenCard: (card: OwnedCard) => void;
}

function YourEntry ({ detail: d, lineup, busy, error, onPick, onWithdraw, onOpenCard }: EntryProps)
{
    const t = d.tournament;
    const you = d.you;
    const open = t.status === 'open';
    if (!you)
    {
        return open ? (
            <div className="rounded-2xl border border-[#e7b54a]/50 bg-[#e7b54a]/5 p-4 text-center">
                <p className="text-sm">Pick 1 to {t.format.slots} of your cards to enter.</p>
                <button onClick={onPick} className="mt-3 rounded-full bg-[#e7b54a] px-6 py-2.5 text-sm font-bold text-[#170e10] active:scale-95">
                    Pick lineup
                </button>
            </div>
        ) : (
            <p className="text-sm text-[#bba595]">You didn't enter this one.</p>
        );
    }
    const points = pointsByCard(you.score);
    return (
        <section aria-label="Your lineup">
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold tracking-wider text-[#bba595] uppercase">Your lineup</h2>
                <p className="text-sm">
                    {you.rank && <span className="mr-2 font-serif font-bold text-[#e7b54a]">{placeText(you.rank)}</span>}
                    <span className="font-bold">{you.score.total} pts</span>
                    {open && <span className="text-xs text-[#bba595]"> (if entries closed now)</span>}
                </p>
            </div>
            <ul className="grid grid-cols-5 gap-2">
                {you.cards.map((c, i) =>
                {
                    const card = c.card ? lineup.find(l => l.id === c.cardId) : undefined;
                    const p = points.get(c.cardId);
                    return (
                        <li key={c.cardId}>
                            {card ? (
                                <button onClick={() => onOpenCard(card)} className="block w-full rounded-[6%] active:scale-95" aria-label={`Slot ${i + 1}: ${card.name}`}>
                                    <CardImage card={card} />
                                </button>
                            ) : (
                                <div className="grid aspect-[5/7] w-full place-items-center rounded-[6%] border border-dashed border-white/15 text-[10px] text-[#bba595]">Gone</div>
                            )}
                            {p && (
                                <p className="mt-0.5 text-center text-[11px] font-bold text-[#e7b54a]">
                                    {p.points}{p.multiplier !== 1 && <span className="font-normal text-[#bba595]"> {multiplierText(p.multiplier)}</span>}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
            {you.score.bonus > 0 && <p className="mt-1 text-xs text-[#bba595]">Lineup bonus +{you.score.bonusPercent}%: +{you.score.bonus} pts</p>}
            {prizeFor(t.prizes, you.rank) > 0 && (
                <p className="mt-2 rounded-xl border border-[#e7b54a]/50 bg-[#e7b54a]/10 px-3 py-2 text-sm">
                    <span aria-hidden="true">🎁 </span>You won {prizeFor(t.prizes, you.rank)} {prizeFor(t.prizes, you.rank) === 1 ? 'card' : 'cards'}! Open {prizeFor(t.prizes, you.rank) === 1 ? 'it' : 'them'} on the Pack tab.
                </p>
            )}
            {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
            {open && (
                <div className="mt-3 flex justify-end gap-2">
                    <button onClick={onWithdraw} disabled={busy} className="rounded-full border border-[#3b2529] px-4 py-2 text-sm font-bold text-[#bba595] active:scale-95 disabled:opacity-60">
                        {busy ? '…' : 'Withdraw'}
                    </button>
                    <button onClick={onPick} disabled={busy} className="rounded-full bg-[#e7b54a] px-4 py-2 text-sm font-bold text-[#170e10] active:scale-95 disabled:opacity-60">
                        Change lineup
                    </button>
                </div>
            )}
        </section>
    );
}

function Results ({ detail: d, me, onOpenProfile }: { detail: TournamentDetail; me: Me; onOpenProfile: (username: string) => void })
{
    if (d.results.length === 0)
    {
        return <p className="text-sm text-[#bba595]">Nobody entered this one.</p>;
    }
    return (
        <section aria-label="Results">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-[#bba595] uppercase">Results</h2>
            <ol className="flex flex-col gap-1.5">
                {d.results.map(r =>
                {
                    const mine = r.username === me.username;
                    return (
                        <li key={r.rank}>
                            <button
                                onClick={() => onOpenProfile(r.username)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${mine ? 'border border-[#e7b54a]/50 bg-[#e7b54a]/10' : 'bg-[#22151a]'}`}
                            >
                                <span className={`w-10 font-serif font-bold ${r.rank <= 3 ? 'text-[#e7b54a]' : 'text-[#bba595]'}`}>{placeText(r.rank)}</span>
                                <span className="mr-auto truncate">{r.username}{mine && ' (you)'}</span>
                                {prizeFor(d.tournament.prizes, r.rank) > 0 && (
                                    <span className="text-xs text-[#e7b54a]" aria-label={`Won ${prizeFor(d.tournament.prizes, r.rank)} cards`}>🎁 {prizeFor(d.tournament.prizes, r.rank)}</span>
                                )}
                                <span className="font-bold">{r.score}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
