import { reloadIntoUpdate } from './serviceWorker';
import { useAppUpdate, useOnline } from './useAppStatus';

// Small notices at the top of every screen: no network, or a new version waiting.
export function AppNotices ({ showOffline = true }: { showOffline?: boolean })
{
    const offline = !useOnline() && showOffline;
    const update = useAppUpdate();
    if (!offline && !update)
    {
        return null;
    }
    return (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-30 flex flex-col items-center gap-2 px-4">
            {offline && (
                <p role="status" className="rounded-full border border-[#3b2529] bg-[#22151a]/95 px-4 py-1.5 text-xs text-[#bba595] shadow-lg">
                    You're offline. Reconnecting when your network is back…
                </p>
            )}
            {update && (
                <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-full border border-[#e7b54a]/50 bg-[#22151a]/95 py-1.5 pr-1.5 pl-4 text-xs text-[#f6eadc] shadow-lg">
                    New version available
                    <button onClick={reloadIntoUpdate} className="rounded-full bg-[#e7b54a] px-3 py-1 font-bold text-[#170e10] active:scale-95">Reload</button>
                </div>
            )}
        </div>
    );
}
