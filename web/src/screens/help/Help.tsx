import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useRules } from '../../app/useRules';
import { helpSections, localResetTime, oddsRows } from './helpModel';

// How to play, over any screen (opened from the "?" next to your name). Sections fold open
// one at a time; the numbers come from GET /rules, so they match the server.
export function Help ({ onClose }: { onClose: () => void })
{
    const rules = useRules();
    const sections = useMemo(() => helpSections(rules, localResetTime()), [rules]);
    const back = useRef<HTMLButtonElement>(null);

    useEffect(() =>
    {
        back.current?.focus({ preventScroll: true });
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <section data-scroll-root className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-[#170e10] text-[#f6eadc]" aria-label="Help">
            <header className="sticky top-0 z-10 border-b border-[#3b2529] bg-[#170e10]/95 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3 backdrop-blur">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <button ref={back} onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 active:bg-white/10">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M15 5l-7 7 7 7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="font-serif text-xl font-bold">How to play</h1>
                        <p className="text-xs text-[#bba595]">Lanka Mythics · collect, merge, trade, compete</p>
                    </div>
                </div>
            </header>

            <div className="mx-auto flex max-w-xl flex-col gap-2 px-4 pt-4 pb-32">
                {sections.map((s, i) => (
                    <details key={s.id} name="help" open={i === 0} className="group rounded-2xl border border-[#3b2529] bg-[#1c1215]">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                            <span aria-hidden="true" className="text-xl">{s.icon}</span>
                            <span className="mr-auto font-bold">{s.title}</span>
                            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#bba595] transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </summary>
                        <div className="flex flex-col gap-2 px-4 pb-4 text-sm leading-relaxed text-[#e9dccd]">
                            {s.lines.map((line, j) => (
                                <Fragment key={j}>
                                    {line.startsWith('• ')
                                        ? <p className="relative pl-4 before:absolute before:left-0 before:text-[#e7b54a] before:content-['•']">{line.slice(2)}</p>
                                        : <p>{line}</p>}
                                    {/* The odds table follows the line that introduces it. */}
                                    {s.id === 'rarity' && j === 0 && <OddsTable rows={oddsRows(rules)} />}
                                </Fragment>
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        </section>
    );
}

function OddsTable ({ rows }: { rows: ReturnType<typeof oddsRows> })
{
    return (
        <table className="mt-1 w-full text-sm">
            <thead>
                <tr className="text-left text-xs text-[#bba595]">
                    <th className="py-1 font-normal">Rarity</th>
                    <th className="py-1 text-right font-normal">Chance per card</th>
                    <th className="py-1 text-right font-normal">About</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(r => (
                    <tr key={r.rarity} className="border-t border-[#3b2529]">
                        <td className="py-1.5 font-bold" style={{ color: r.color }}>{r.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.percent}</td>
                        <td className="py-1.5 text-right text-[#bba595] tabular-nums">{r.odds}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
