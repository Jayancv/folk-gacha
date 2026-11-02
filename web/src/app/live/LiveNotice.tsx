import { useEffect, useRef } from 'react';

/** How long a live notice stays up. */
const NOTICE_MS = 6_000;

// A short line at the top for a live event ("asha sent you a trade offer"), over any screen.
export function LiveNotice ({ text, onView, onClose }: { text: string; onView?: () => void; onClose: () => void })
{
    // The timer restarts only for a new text, not when the parent re-renders.
    const close = useRef(onClose);
    useEffect(() =>
    {
        close.current = onClose;
    });
    useEffect(() =>
    {
        const t = setTimeout(() => close.current(), NOTICE_MS);
        return () => clearTimeout(t);
    }, [text]);

    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <div role="status" className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#e7b54a]/50 bg-[#22151a]/95 px-4 py-2.5 text-sm text-[#f6eadc] shadow-lg backdrop-blur">
                <span className="mr-auto">{text}</span>
                {onView && (
                    <button onClick={() => { onView(); onClose(); }} className="shrink-0 rounded-full bg-[#e7b54a] px-3 py-1 text-xs font-bold text-[#170e10] active:scale-95">
                        View
                    </button>
                )}
                <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-[#bba595]">✕</button>
            </div>
        </div>
    );
}
