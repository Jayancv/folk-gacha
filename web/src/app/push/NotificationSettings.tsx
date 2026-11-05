import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ME_KEY, type Me } from '../../auth/useAuth';
import { usePushNotifications } from './usePushNotifications';

const BELL = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0';

/** Saves the trade notification choice (PUT /me/notifications), showing it at once. */
function useSetTradeNotices ()
{
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (trades: boolean) =>
        {
            const { response } = await api.PUT('/me/notifications', { body: { trades } });
            if (!response.ok)
            {
                throw new Error(`PUT /me/notifications: ${response.status}`);
            }
        },
        onMutate: trades =>
        {
            const before = qc.getQueryData<Me | null>(ME_KEY);
            qc.setQueryData<Me | null>(ME_KEY, m => (m ? { ...m, notifyTrades: trades } : m));
            return { before };
        },
        onError: (_err, _trades, ctx) => qc.setQueryData(ME_KEY, ctx?.before),
        onSettled: () => void qc.invalidateQueries({ queryKey: ME_KEY })
    });
}

// Your own profile: notifications on this device ("your pack is ready"), and whether trades
// buzz your phone too (every device; sent only while the app is closed).
export function NotificationSettings ({ me }: { me: Me })
{
    const device = usePushNotifications();
    const setTrades = useSetTradeNotices();
    if (device.state === 'hidden')
    {
        return null;
    }
    const tradesOn = me.notifyTrades;

    return (
        <section className="mt-4 rounded-xl border border-[#3b2529] bg-[#1c1215] px-4 py-3 text-sm" aria-labelledby="notifications-title">
            <h2 id="notifications-title" className="flex items-center gap-2 font-bold">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#e7b54a]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                    <path d={BELL} />
                </svg>
                Notifications
            </h2>

            <div className="mt-2 flex items-center gap-3">
                <p className="mr-auto text-xs text-[#bba595]">
                    {device.state === 'on' && 'On for this device: your daily pack, and what you pick below.'}
                    {device.state === 'off' && 'Off on this device.'}
                    {device.state === 'blocked' && 'Blocked for this site in your browser settings.'}
                    {device.state === 'install-first' && 'Add Folk Gacha to your Home Screen to get notifications on iPhone.'}
                </p>
                {device.state === 'off' && (
                    <button onClick={device.turnOn} disabled={device.busy} className="shrink-0 rounded-full bg-[#e7b54a] px-3 py-1 text-xs font-bold text-[#170e10] active:scale-95 disabled:opacity-60">
                        {device.busy ? '…' : 'Turn on'}
                    </button>
                )}
                {device.state === 'on' && (
                    <button onClick={device.turnOff} disabled={device.busy} className="shrink-0 text-xs text-[#bba595] underline disabled:opacity-60">Turn off</button>
                )}
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-3 border-t border-[#3b2529] pt-3">
                <span className="mr-auto">
                    <span className="block">Trades</span>
                    <span className="block text-xs text-[#bba595]">A new offer for you, or yours accepted (when the app is closed)</span>
                </span>
                <input
                    type="checkbox"
                    role="switch"
                    checked={tradesOn}
                    onChange={e => setTrades.mutate(e.target.checked)}
                    className="peer sr-only"
                />
                <span
                    aria-hidden="true"
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#e7b54a] ${tradesOn ? 'bg-[#e7b54a]' : 'bg-white/15'}`}
                >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${tradesOn ? 'left-[1.375rem]' : 'left-0.5'}`} />
                </span>
            </label>
            {setTrades.isError && <p className="mt-1 text-xs text-rose-300">Couldn't save. Try again.</p>}
        </section>
    );
}
