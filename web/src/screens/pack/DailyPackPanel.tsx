import { useEffect, useState } from 'react';
import type { ClaimError } from '../../api/game';
import type { Me } from '../../auth/useAuth';
import { claimErrorText, nextPackText } from './dailyPack';

interface Props
{
    status: Me['dailyPack'];
    claiming: boolean;
    error: ClaimError | null;
    onClaim: () => void;
    /** Called once when the countdown reaches the reset, to refresh the status. */
    onReset: () => void;
    /** Shown under the countdown while waiting (the "notify me" line). */
    waitingFooter?: React.ReactNode;
}

// Shown over the Pack table before today's pack is open: the claim button, or a
// countdown to the next 00:00 UTC reset when today's pack is already open.
export function DailyPackPanel ({ status, claiming, error, onClaim, onReset, waitingFooter }: Props)
{
    const [now, setNow] = useState(() => Date.now());
    const waiting = status !== undefined && !status.ready;

    useEffect(() =>
    {
        if (!waiting)
        {
            return;
        }
        const tick = setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(tick);
    }, [waiting]);

    const resetPassed = waiting && Date.parse(status.nextResetAt) <= now;
    useEffect(() =>
    {
        if (resetPassed)
        {
            onReset();
        }
    }, [resetPassed, onReset]);

    return (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center px-4">
            <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-[#3b2529] bg-[#1c1215]/90 px-6 py-5 text-center shadow-xl backdrop-blur">
                {status === undefined ? (
                    <p className="text-sm text-[#bba595]">Packs aren't available on this server.</p>
                ) : waiting ? (
                    <>
                        <p className="font-serif text-lg font-bold text-[#f6eadc]">Today's pack is open</p>
                        <p className="text-sm text-[#bba595]" aria-live="polite">{nextPackText(status.nextResetAt, now)}</p>
                        <p className="text-xs text-[#bba595]/80">A new pack arrives every day at 00:00 UTC.</p>
                        {waitingFooter}
                    </>
                ) : (
                    <>
                        <p className="font-serif text-lg font-bold text-[#f6eadc]">Your daily pack is here</p>
                        <button
                            onClick={onClaim}
                            disabled={claiming}
                            className="rounded-full bg-[#e7b54a] px-7 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95 disabled:opacity-60"
                        >
                            {claiming ? 'Opening…' : "Open today's pack"}
                        </button>
                    </>
                )}
                {error && error !== 'already_claimed' && (
                    <p role="alert" className="text-xs text-rose-300">{claimErrorText(error)}</p>
                )}
            </div>
        </div>
    );
}
