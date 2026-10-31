import { useState } from 'react';
import type { OwnedCard } from '../../api/cards';
import { ApiRequestError, type Me } from '../../auth/useAuth';
import { CardImage } from '../collection/CardImage';
import { CardSheet } from '../collection/CardSheet';
import { TradeComposer } from '../trades/TradeComposer';
import { tradeUnlockText } from '../trades/tradeModel';
import { joinedText, MAX_SHOWCASE } from './profileModel';
import { ShowcasePicker } from './ShowcasePicker';
import { useProfile, useSetShowcase } from './useProfile';

// A player's profile over the table: stats and showcase cards. Your own has "Edit showcase";
// others' have "Propose trade".
export function Profile ({ username, me, onClose, onTradeSent }: { username: string; me: Me; onClose: () => void; onTradeSent: () => void })
{
    const profile = useProfile(username);
    const mine = username.toLowerCase() === me.username.toLowerCase();
    const save = useSetShowcase(username);
    const [editing, setEditing] = useState(false);
    const [open, setOpen] = useState<OwnedCard | null>(null);
    const [trading, setTrading] = useState(false);
    const locked = tradeUnlockText(me.tradeUnlockedAt);
    const p = profile.data;

    return (
        <section data-scroll-root className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label={`${username}'s profile`}>
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3 backdrop-blur">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <button onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 active:bg-white/10">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M15 5l-7 7 7 7" />
                        </svg>
                    </button>
                    <div className="mr-auto min-w-0">
                        {/* displayName only comes with your own profile; others see the username. */}
                        <h1 className="truncate font-serif text-xl font-bold">{p?.displayName ?? p?.username ?? username}</h1>
                        <p className="truncate text-xs text-[#bba595]">
                            {p ? (p.displayName ? `@${p.username} · ${joinedText(p.joinedAt)}` : joinedText(p.joinedAt)) : ' '}
                        </p>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-xl px-4 pt-4 pb-16">
                {profile.isPending ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">Loading…</p>
                ) : profile.isError ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">
                        {profile.error instanceof ApiRequestError && profile.error.status === 404 ? 'No player by that name.' : "Couldn't load this profile."}
                    </p>
                ) : p && (
                    <>
                        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Stat label="Collection power" value={p.collectionPower} accent />
                            <Stat label="Cards" value={p.cardCount} />
                            <Stat label="Recipes found" value={p.recipesDiscovered} />
                            <Stat label="Top 3 weeks" value={p.podiums} />
                        </dl>

                        {!mine && (
                            <div className="mt-4">
                                <button
                                    onClick={() => setTrading(true)}
                                    disabled={locked !== null}
                                    className="w-full rounded-xl bg-[#e7b54a] py-3 text-sm font-bold text-[#170e10] active:scale-[0.98] disabled:opacity-50"
                                >
                                    Propose trade
                                </button>
                                {locked && <p className="mt-1.5 text-center text-xs text-[#bba595]">{locked}</p>}
                            </div>
                        )}

                        <div className="mt-6 flex items-end justify-between gap-3">
                            <div>
                                <h2 className="font-serif text-lg font-bold">Showcase</h2>
                                {!p.showcaseChosen && p.showcase.length > 0 && (
                                    <p className="text-xs text-[#bba595]">{mine ? 'Showing your best cards. Pick your own:' : 'Their best cards'}</p>
                                )}
                            </div>
                            {mine && (
                                <button onClick={() => setEditing(true)} className="rounded-full border border-[#e7b54a]/60 px-3 py-1.5 text-xs font-bold text-[#e7b54a] active:bg-white/5">
                                    Edit showcase
                                </button>
                            )}
                        </div>

                        {p.showcase.length === 0 ? (
                            <p className="py-10 text-center text-sm text-[#bba595]">{mine ? 'No cards yet. Open your daily pack to start.' : 'No cards yet.'}</p>
                        ) : (
                            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                {p.showcase.slice(0, MAX_SHOWCASE).map(card => (
                                    <li key={card.id}>
                                        <button onClick={() => setOpen(card)} className="block w-full rounded-[6%] active:scale-95" aria-label={`${card.name}, level ${card.level}`}>
                                            <CardImage card={card} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-6 text-center text-xs text-[#bba595]/80">Collection power is the total score of your best 10 cards.</p>
                    </>
                )}
            </div>

            {open && <CardSheet card={open} onClose={() => setOpen(null)} />}
            {trading && p && (
                <TradeComposer username={p.username} onClose={() => setTrading(false)} onSent={() => { setTrading(false); onTradeSent(); }} />
            )}
            {editing && p && (
                <ShowcasePicker
                    initial={p.showcaseChosen ? p.showcase.map(c => c.id) : []}
                    saving={save.isPending}
                    error={save.error ? save.error.message : null}
                    onCancel={() => setEditing(false)}
                    onSave={ids => save.mutate(ids, { onSuccess: () => setEditing(false) })}
                />
            )}
        </section>
    );
}

function Stat ({ label, value, accent = false }: { label: string; value: number; accent?: boolean })
{
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${accent ? 'border-[#e7b54a]/50 bg-[#e7b54a]/10' : 'border-[#3b2529] bg-[#22151a]'}`}>
            <dt className="text-[11px] text-[#bba595]">{label}</dt>
            <dd className={`text-xl font-bold tabular-nums ${accent ? 'text-[#e7b54a]' : ''}`}>{value.toLocaleString()}</dd>
        </div>
    );
}
