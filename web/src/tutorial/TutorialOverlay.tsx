import { useEffect, useState } from 'react';
import { STEP_ORDER, type StepContent } from './tutorialModel';

interface Rect { x: number; y: number; w: number; h: number }

/** Follows a control marked data-tutorial="<target>" (it can move: layout, scrolling, panels appearing). */
function useTargetRect (target: string | undefined): Rect | null
{
    const [rect, setRect] = useState<Rect | null>(null);
    useEffect(() =>
    {
        if (!target)
        {
            setRect(null);
            return;
        }
        let frame = 0;
        const measure = () =>
        {
            const el = document.querySelector(`[data-tutorial="${target}"]`);
            const r = el?.getBoundingClientRect();
            setRect(prev =>
            {
                if (!r || r.width === 0)
                {
                    return null;
                }
                const next = { x: r.x, y: r.y, w: r.width, h: r.height };
                return prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next;
            });
            frame = requestAnimationFrame(measure);
        };
        measure();
        return () => cancelAnimationFrame(frame);
    }, [target]);
    return rect;
}

const PAD = 8;

// The tutorial on top of the game: a spotlight on the control to use (if any) and a
// bubble explaining it. Never blocks the game: everything but the bubble lets taps through.
export function TutorialOverlay ({ content, number, onNext, onSkip }: { content: StepContent; number: number; onNext: () => void; onSkip: () => void })
{
    const rect = useTargetRect(content.target);
    // Bubble above a target in the lower half of the screen, below one in the upper half;
    // without a target, just above the tab bar.
    const below = rect !== null && rect.y + rect.h / 2 < window.innerHeight / 2;
    const bubbleStyle: React.CSSProperties = rect
        ? below ? { top: rect.y + rect.h + PAD + 14 } : { bottom: window.innerHeight - rect.y + PAD + 14 }
        : { bottom: 'calc(max(env(safe-area-inset-bottom), 0.5rem) + 6.5rem)' };

    return (
        <div className="pointer-events-none fixed inset-0 z-[35]" aria-live="polite">
            {rect && (
                <div
                    data-tutorial-spotlight=""
                    className="fixed rounded-2xl"
                    style={{
                        left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2,
                        // One shadow does it all (a Tailwind ring would be overwritten, it's a box-shadow too):
                        // a gold ring, a soft glow, and a huge spread that dims everything else.
                        // Shadows don't catch taps, so the game stays usable.
                        boxShadow: '0 0 0 3px #e7b54a, 0 0 22px 6px rgba(231, 181, 74, 0.55), 0 0 0 9999px rgba(10, 5, 8, 0.55)'
                    }}
                />
            )}
            <div className="fixed inset-x-0 flex justify-center px-4" style={bubbleStyle}>
                <div role="dialog" aria-label={`Tutorial: ${content.title}`} className="pointer-events-auto w-full max-w-sm rounded-2xl border border-[#e7b54a]/60 bg-[#22151a] px-4 py-3 text-[#f6eadc] shadow-2xl">
                    <div className="flex items-center gap-2">
                        <p className="mr-auto font-serif text-base font-bold text-[#e7b54a]">{content.title}</p>
                        <div className="flex gap-1" aria-label={`Step ${number} of ${STEP_ORDER.length}`}>
                            {STEP_ORDER.map((_, i) => (
                                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < number ? 'bg-[#e7b54a]' : 'bg-white/20'}`} />
                            ))}
                        </div>
                    </div>
                    <p className="mt-1 text-sm text-[#e8dccd]">{content.body}</p>
                    <div className="mt-2 flex items-center justify-end gap-3">
                        {!content.button && <button onClick={onSkip} className="mr-auto text-xs text-[#bba595] underline">Skip tutorial</button>}
                        {content.button && (
                            <button onClick={onNext} className="rounded-full bg-[#e7b54a] px-4 py-1.5 text-sm font-bold text-[#170e10] active:scale-95">
                                {content.button}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
