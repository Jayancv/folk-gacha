import type { PushState } from './pushPolicy';

const BELL = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0';

// One line on the "next pack in…" panel: turn "your pack is ready" notifications on or off.
export function PackReadyToggle ({ state, busy, onTurnOn, onTurnOff }: { state: PushState; busy: boolean; onTurnOn: () => void; onTurnOff: () => void })
{
    if (state === 'hidden')
    {
        return null;
    }
    return (
        <div className="flex items-center justify-center gap-2 border-t border-[#3b2529] pt-3 text-xs text-[#bba595]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#e7b54a]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d={BELL} />
            </svg>
            {state === 'off' && (
                <>
                    <span>Get a notification when it's ready</span>
                    <button onClick={onTurnOn} disabled={busy} className="rounded-full bg-[#e7b54a] px-3 py-1 font-bold text-[#170e10] active:scale-95 disabled:opacity-60">
                        {busy ? '…' : 'Notify me'}
                    </button>
                </>
            )}
            {state === 'on' && (
                <>
                    <span>Notifications on</span>
                    <button onClick={onTurnOff} disabled={busy} className="underline disabled:opacity-60">Turn off</button>
                </>
            )}
            {state === 'blocked' && <span>Notifications are blocked for this site in your browser settings.</span>}
            {state === 'install-first' && <span>Add Folk Gacha to your Home Screen to get pack notifications.</span>}
        </div>
    );
}
