import type { InstallOffer } from './installPolicy';

// Offers installing the app: the browser's install dialog, or how to do it on iPhone/iPad.
export function InstallBanner ({ offer, onInstall, onDismiss }: { offer: InstallOffer; onInstall: () => void; onDismiss: () => void })
{
    return (
        <div
            role="region"
            aria-label="Install the app"
            className="pointer-events-auto mx-4 flex max-w-sm items-center gap-3 rounded-2xl border border-[#3b2529] bg-[#22151a]/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
        >
            <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
            {offer === 'prompt' ? (
                <>
                    <p className="mr-auto text-[#f6eadc]">Install Folk Gacha: tomorrow's pack is one tap away.</p>
                    <button onClick={onInstall} className="shrink-0 rounded-full bg-[#e7b54a] px-4 py-2 font-bold text-[#170e10] active:scale-95">Install</button>
                    <button onClick={onDismiss} className="shrink-0 text-xs text-[#bba595] underline">Not now</button>
                </>
            ) : (
                <>
                    <p className="mr-auto text-[#f6eadc]">
                        Add Folk Gacha to your Home Screen: tap{' '}
                        <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-[-2px] text-[#e7b54a]" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Share">
                            <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" />
                        </svg>{' '}
                        Share, then <b>Add to Home Screen</b>.
                    </p>
                    <button onClick={onDismiss} className="shrink-0 rounded-full border border-[#3b2529] px-3 py-2 text-xs font-bold text-[#bba595]">Got it</button>
                </>
            )}
        </div>
    );
}
