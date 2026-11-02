import { useState } from 'react';
import type { OwnedCard } from '../../api/cards';
import { CardImage } from '../collection/CardImage';
import { NO_FILTERS } from '../collection/filters';
import { useCollection } from '../collection/useCollection';
import { togglePick } from '../profile/profileModel';
import { InTradeBadge } from './InTradeBadge';
import { useRules } from '../../app/useRules';
import { hoursText, pickCountText, tradeErrorText } from './tradeModel';
import { errorOf, useCreateTrade, usePlayerCards } from './useTrades';

type Step = 'request' | 'offer' | 'review';

interface Props
{
    /** Who the offer goes to. */
    username: string;
    onClose: () => void;
    /** The offer was sent. */
    onSent: () => void;
}

// Proposing a trade: pick their cards, then yours (1 to 5 each), review, send.
// The server checks everything again; this only collects the picks.
export function TradeComposer ({ username, onClose, onSent }: Props)
{
    const [step, setStep] = useState<Step>('request');
    const [request, setRequest] = useState<OwnedCard[]>([]);
    const [offer, setOffer] = useState<OwnedCard[]>([]);
    const theirs = usePlayerCards(username);
    const mine = useCollection({ ...NO_FILTERS, sort: 'score' });
    const send = useCreateTrade();
    const { maxTradeCards, offerExpiryHours } = useRules();
    const failed = send.isError ? tradeErrorText(errorOf(send.error).code, errorOf(send.error).message) : null;

    const pick = (list: OwnedCard[], set: (l: OwnedCard[]) => void) => (card: OwnedCard) =>
    {
        const ids = togglePick(list.map(c => c.id), card.id, maxTradeCards);
        set(ids.map(id => list.find(c => c.id === id) ?? card));
    };
    const back = () => (step === 'request' ? onClose() : setStep(step === 'review' ? 'offer' : 'request'));
    const submit = () =>
        send.mutate({ to: username, offer: offer.map(c => c.id), request: request.map(c => c.id) }, { onSuccess: onSent });

    const title = step === 'request' ? `Ask ${username} for` : step === 'offer' ? 'Offer in return' : 'Review your offer';
    const picked = step === 'request' ? request : offer;

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#170e10] text-[#f6eadc]" role="dialog" aria-modal="true" aria-label={`Trade with ${username}`}>
            <header className="border-b border-[#3b2529] px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <button onClick={back} aria-label={step === 'request' ? 'Cancel' : 'Back'} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 active:bg-white/10">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={step === 'request' ? 'M6 6l12 12M18 6L6 18' : 'M15 5l-7 7 7 7'} />
                        </svg>
                    </button>
                    <div className="mr-auto min-w-0">
                        <p className="text-[11px] tracking-wider text-[#bba595] uppercase">Step {step === 'request' ? 1 : step === 'offer' ? 2 : 3} of 3</p>
                        <h2 className="truncate font-serif text-lg font-bold">{title}</h2>
                    </div>
                </div>
            </header>

            <div data-scroll-root className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
                <div className="mx-auto max-w-xl">
                    {step === 'review' ? (
                        <div className="flex flex-col gap-5">
                            <ReviewSide label="You give" cards={offer} />
                            <ReviewSide label={`You get from ${username}`} cards={request} />
                            <p className="text-xs text-[#bba595]">
                                {username} has {hoursText(offerExpiryHours)} to accept. Until then the cards you give are locked: they can't be merged or offered
                                elsewhere. Withdraw the offer anytime from Trades.
                            </p>
                        </div>
                    ) : (
                        <PickGrid
                            query={step === 'request' ? theirs : mine}
                            picked={picked.map(c => c.id)}
                            max={maxTradeCards}
                            onPick={step === 'request' ? pick(request, setRequest) : pick(offer, setOffer)}
                            empty={step === 'request' ? `${username} has no cards yet.` : 'No cards yet. Open your daily pack first.'}
                            // Their cards in their own open offer can't be asked for; yours can't be offered twice.
                            lockedText={step === 'request' ? 'In their offer' : 'In an offer'}
                        />
                    )}
                </div>
            </div>

            <footer className="border-t border-[#3b2529] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    {failed && step === 'review'
                        ? <p role="alert" className="mr-auto text-xs text-rose-300">{failed}</p>
                        : <p className="mr-auto text-xs text-[#bba595]" aria-live="polite">{step === 'review' ? `${offer.length} for ${request.length}` : pickCountText(picked.length, maxTradeCards)}</p>}
                    {step === 'review' ? (
                        <button onClick={submit} disabled={send.isPending} className="rounded-full bg-[#e7b54a] px-5 py-2.5 text-sm font-bold text-[#170e10] active:scale-95 disabled:opacity-60">
                            {send.isPending ? 'Sending…' : 'Send offer'}
                        </button>
                    ) : (
                        <button
                            onClick={() => setStep(step === 'request' ? 'offer' : 'review')}
                            disabled={picked.length === 0}
                            className="rounded-full bg-[#e7b54a] px-5 py-2.5 text-sm font-bold text-[#170e10] active:scale-95 disabled:opacity-40"
                        >
                            Next
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
}

interface PickQuery
{
    data?: { pages: { cards: OwnedCard[] }[] };
    isPending: boolean;
    isError: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
    refetch: () => Promise<unknown>;
}

function PickGrid ({ query, picked, max, onPick, empty, lockedText }: { query: PickQuery; picked: string[]; max: number; onPick: (card: OwnedCard) => void; empty: string; lockedText: string })
{
    const list = query.data?.pages.flatMap(p => p.cards) ?? [];
    if (query.isPending)
    {
        return <p className="py-16 text-center text-sm text-[#bba595]">Loading cards…</p>;
    }
    if (query.isError && list.length === 0)
    {
        return (
            <p className="py-16 text-center text-sm text-[#bba595]">
                Couldn't load the cards. <button className="text-[#e7b54a] underline" onClick={() => void query.refetch()}>Retry</button>
            </p>
        );
    }
    if (list.length === 0)
    {
        return <p className="py-16 text-center text-sm text-[#bba595]">{empty}</p>;
    }
    return (
        <>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {list.map(card =>
                {
                    const at = picked.indexOf(card.id);
                    const full = picked.length >= max && at < 0;
                    return (
                        <li key={card.id}>
                            <button
                                onClick={() => onPick(card)}
                                disabled={card.inTrade}
                                aria-pressed={at >= 0}
                                aria-label={`${card.name}, level ${card.level}${card.inTrade ? `, ${lockedText.toLowerCase()}` : ''}`}
                                className={`relative block w-full rounded-[6%] transition ${at >= 0 ? 'ring-3 ring-[#e7b54a]' : ''} ${full || card.inTrade ? 'opacity-45' : ''}`}
                            >
                                <CardImage card={card} />
                                {card.inTrade && <InTradeBadge text={lockedText} />}
                                {at >= 0 && (
                                    <span className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-[#e7b54a] text-sm font-bold text-[#170e10] shadow">✓</span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {query.hasNextPage && (
                <button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="mx-auto mt-4 block text-sm text-[#e7b54a] underline">
                    {query.isFetchingNextPage ? 'Loading…' : 'Show more cards'}
                </button>
            )}
        </>
    );
}

function ReviewSide ({ label, cards }: { label: string; cards: OwnedCard[] })
{
    return (
        <section>
            <h3 className="mb-2 text-xs font-bold tracking-wider text-[#bba595] uppercase">{label}</h3>
            <ul className="grid grid-cols-5 gap-2">
                {cards.map(c => (
                    <li key={c.id}><CardImage card={c} eager /></li>
                ))}
            </ul>
        </section>
    );
}
