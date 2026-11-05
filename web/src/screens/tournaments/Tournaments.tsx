import { useState } from 'react';
import type { Me } from '../../auth/useAuth';
import { entriesText, formatRule, groupTournaments, statusLine, type Tournament } from './tournamentModel';
import { TournamentScreen } from './TournamentScreen';
import { useTournaments } from './useTournaments';

// The Tournament tab: tournaments running now, coming up, and the past week. Plain React over
// the sleeping table, like Trades. The server scores every lineup.
export function Tournaments ({ me, onOpenProfile }: { me: Me; onOpenProfile: (username: string) => void })
{
    const list = useTournaments();
    const [openId, setOpenId] = useState<string | null>(null);
    const groups = list.data ? groupTournaments(list.data.tournaments, list.data.upcoming) : null;

    // The tournament page sits outside the list's section: that section is a z-0 layer, so
    // anything inside it (even fixed z-30) would paint under the tab bar.
    return (
        <>
        <section data-scroll-root className="absolute inset-0 z-0 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label="Tournaments">
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-12 pb-3 backdrop-blur">
                <div className="mx-auto max-w-xl">
                    <h1 className="font-serif text-xl font-bold">Tournaments</h1>
                    <p className="text-xs text-[#bba595]">Enter a lineup of your cards. Every tournament scores them its own way.</p>
                </div>
            </header>

            <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-4 pb-32">
                {list.isPending ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">Loading…</p>
                ) : !groups ? (
                    <p className="py-16 text-center text-sm text-[#bba595]">
                        Couldn't load the tournaments.{' '}
                        <button className="text-[#e7b54a] underline" onClick={() => void list.refetch()}>Retry</button>
                    </p>
                ) : (
                    <>
                        <Group title="Now" empty="No tournament running right now.">
                            {groups.now.map(t => <Row key={t.id} t={t} onOpen={() => setOpenId(t.id)} />)}
                        </Group>
                        {groups.next.length > 0 && <Group title="Coming up">{groups.next.map(t => <Row key={t.id} t={t} />)}</Group>}
                        {groups.past.length > 0 && <Group title="Past week">{groups.past.map(t => <Row key={t.id} t={t} onOpen={() => setOpenId(t.id)} />)}</Group>}
                    </>
                )}
            </div>
        </section>
        {openId && <TournamentScreen id={openId} me={me} onClose={() => setOpenId(null)} onOpenProfile={onOpenProfile} />}
        </>
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

// One tournament. Upcoming ones (not created yet) only show when they open.
function Row ({ t, onOpen }: { t: Tournament; onOpen?: () => void })
{
    const open = t.status === 'open';
    const body = (
        <>
            <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate font-bold">
                    {t.name} <span className="font-normal text-[#bba595]">· {t.format.name}</span>
                </p>
                {t.entered && <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">Entered</span>}
                {open && !t.entered && <span className="shrink-0 rounded-full bg-[#e7b54a] px-2 py-0.5 text-[11px] font-bold text-[#170e10]">Enter</span>}
            </div>
            <p className="mt-1 text-sm">{formatRule(t.format, t.element)}</p>
            <p className="mt-1 text-xs text-[#bba595]">
                {statusLine(t)}
                {t.status !== 'upcoming' && ` · ${entriesText(t.entries)}`}
            </p>
        </>
    );
    const style = `block w-full rounded-2xl border p-3 text-left ${open ? 'border-[#e7b54a]/50 bg-[#e7b54a]/5' : 'border-[#3b2529] bg-[#22151a]'}`;
    return (
        <li>
            {onOpen ? <button onClick={onOpen} className={`${style} active:scale-[0.99]`}>{body}</button> : <div className={`${style} opacity-70`}>{body}</div>}
        </li>
    );
}
