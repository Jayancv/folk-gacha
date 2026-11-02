import { useState } from 'react';
import type { OwnedCard } from '../../api/cards';
import { useRules } from '../../app/useRules';
import type { Me } from '../../auth/useAuth';
import { CardImage } from '../collection/CardImage';
import { CardSheet } from '../collection/CardSheet';
import { expiresText, groupTrades, historyText, hoursText, statusText, tradeErrorText, tradeUnlockText, type TradeCard, type TradeView } from './tradeModel';
import { errorOf, useTradeAction, useTrades, type TradeAction } from './useTrades';

// Your trade offers: waiting for you, sent by you, and the last week's. Plain React
// over the sleeping table, like the collection. The server does every swap.
export function Trades ({ me, onOpenProfile }: { me: Me; onOpenProfile: (username: string) => void })
{
    const trades = useTrades();
    const { offerExpiryHours } = useRules();
    const act = useTradeAction();
    const [open, setOpen] = useState<OwnedCard | null>(null);
    // The answer to the last action, shown at the top (a finished trade lists what you got).
    const [done, setDone] = useState<TradeView | null>(null);
    const locked = tradeUnlockText(me.tradeUnlockedAt);
    const groups = groupTrades(trades.data ?? []);
    const failed = act.isError ? { id: act.variables.id, text: tradeErrorText(errorOf(act.error).code, errorOf(act.error).message) } : null;

    const run = (id: string, action: TradeAction) =>
    {
        setDone(null);
        act.mutate({ id, action }, { onSuccess: t => setDone(t) });
    };
    const row = (t: TradeView) => (
        <TradeRow
            key={t.id}
            trade={t}
            busy={act.isPending && act.variables.id === t.id ? act.variables.action : null}
            error={failed?.id === t.id ? failed.text : null}
            onAct={action => run(t.id, action)}
            onOpenCard={setOpen}
            onOpenProfile={onOpenProfile}
        />
    );

    return (
        <section data-scroll-root className="absolute inset-0 z-0 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label="Trades">
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-12 pb-3 backdrop-blur">
                <div className="mx-auto max-w-xl">
                    <h1 className="font-serif text-xl font-bold">Trades</h1>
                    <p className="text-xs text-[#bba595]">Swap cards with other players. Offers last {hoursText(offerExpiryHours)}.</p>
                </div>
            </header>

            <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-4 pb-32">
                {locked && <p className="rounded-xl border border-[#3b2529] bg-[#22151a] px-3 py-2.5 text-sm text-[#bba595]">{locked}</p>}
                {done && <DoneNotice trade={done} onClose={() => setDone(null)} />}

                {trades.isPending ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">Loading…</p>
                ) : trades.isError && !trades.data ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">
                        Couldn't load your trades.{' '}
                        <button className="text-[#e7b54a] underline" onClick={() => void trades.refetch()}>Retry</button>
                    </p>
                ) : trades.data.length === 0 ? (
                    <div className="py-12 text-center text-sm text-[#bba595]">
                        <p className="font-bold text-[#f6eadc]">No offers yet</p>
                        <p className="mt-1">Open a player's profile (tap a name on Ranks) and tap <span className="text-[#e7b54a]">Propose trade</span>.</p>
                    </div>
                ) : (
                    <>
                        <Group title="Waiting for you" empty="No offers waiting for you.">{groups.incoming.map(row)}</Group>
                        {groups.sent.length > 0 && <Group title="Sent">{groups.sent.map(row)}</Group>}
                        {groups.history.length > 0 && <Group title="Past week">{groups.history.map(row)}</Group>}
                    </>
                )}
            </div>

            {open && <CardSheet card={open} onClose={() => setOpen(null)} />}
        </section>
    );
}

function Group ({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode[] })
{
    return (
        <section aria-label={title}>
            <h2 className="mb-2 text-xs font-bold tracking-wider text-[#bba595] uppercase">{title}</h2>
            {children.length === 0 ? <p className="text-sm text-[#bba595]/80">{empty}</p> : <ul className="flex flex-col gap-3">{children}</ul>}
        </section>
    );
}

interface RowProps
{
    trade: TradeView;
    /** The action running for this offer. */
    busy: TradeAction | null;
    error: string | null;
    onAct: (action: TradeAction) => void;
    onOpenCard: (card: OwnedCard) => void;
    onOpenProfile: (username: string) => void;
}

function TradeRow ({ trade: t, busy, error, onAct, onOpenCard, onOpenProfile }: RowProps)
{
    // Past offers are one line: their cards may have been merged or traded on since.
    if (t.status !== 'open')
    {
        return <li className="truncate border-b border-[#3b2529] pb-2 text-sm text-[#bba595] last:border-b-0">{historyText(t)}</li>;
    }
    return (
        <li className={`rounded-2xl border p-3 ${t.incoming ? 'border-[#e7b54a]/50 bg-[#e7b54a]/5' : 'border-[#3b2529] bg-[#22151a]'}`}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold">
                    {t.incoming ? 'Offer from ' : 'To '}
                    <button onClick={() => onOpenProfile(t.partner)} className="text-[#e7b54a] underline-offset-2 active:underline">{t.partner}</button>
                </p>
                <p className="shrink-0 text-xs text-[#bba595]">{expiresText(t.expiresAt)}</p>
            </div>

            <Side label="You give" cards={t.youGive} onOpenCard={onOpenCard} />
            <Side label="You get" cards={t.youGet} onOpenCard={onOpenCard} />

            {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
                {t.incoming ? (
                    <>
                        <ActionButton onClick={() => onAct('decline')} busy={busy === 'decline'} disabled={busy !== null}>Decline</ActionButton>
                        <ActionButton onClick={() => onAct('accept')} busy={busy === 'accept'} disabled={busy !== null} primary>Accept</ActionButton>
                    </>
                ) : (
                    <ActionButton onClick={() => onAct('cancel')} busy={busy === 'cancel'} disabled={busy !== null}>Withdraw</ActionButton>
                )}
            </div>
        </li>
    );
}

function Side ({ label, cards, onOpenCard }: { label: string; cards: TradeCard[]; onOpenCard: (card: OwnedCard) => void })
{
    return (
        <div className="mt-2 flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-[#bba595]">{label}</span>
            <ul className="flex min-w-0 gap-1.5">
                {cards.map(c => (
                    <li key={c.cardId} className="w-12 sm:w-14">
                        {c.card ? (
                            <button onClick={() => onOpenCard(c.card!)} className="block w-full rounded-[6%] active:scale-95" aria-label={`${c.card.name}, level ${c.card.level}`}>
                                <CardImage card={c.card} />
                            </button>
                        ) : (
                            <div className="grid aspect-[5/7] w-full place-items-center rounded-[6%] border border-dashed border-white/15 text-[10px] text-[#bba595]">Gone</div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ActionButton ({ onClick, busy, disabled, primary = false, children }: { onClick: () => void; busy: boolean; disabled: boolean; primary?: boolean; children: string })
{
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`rounded-full px-4 py-2 text-sm font-bold active:scale-95 disabled:opacity-60 ${
                primary ? 'bg-[#e7b54a] text-[#170e10]' : 'border border-[#3b2529] text-[#bba595]'
            }`}
        >
            {busy ? '…' : children}
        </button>
    );
}

// After an action: one line saying what happened.
function DoneNotice ({ trade: t, onClose }: { trade: TradeView; onClose: () => void })
{
    const text = t.status === 'accepted'
        ? `Trade done! Your new cards are in your collection.${t.gifted ? ` Your first trade with ${t.partner} also earned you a gift: open it on the Pack tab.` : ''}`
        : t.status === 'declined' ? 'Offer declined.' : t.status === 'cancelled' ? 'Offer withdrawn. Your cards are free again.' : statusText(t);
    return (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-sm">
            <p className="mr-auto">{text}</p>
            <button onClick={onClose} aria-label="Dismiss" className="text-[#bba595]">✕</button>
        </div>
    );
}
