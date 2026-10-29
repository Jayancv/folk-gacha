import { useEffect, useState } from 'react';
import { PhaserGame } from './PhaserGame';
import { ApiStatus } from './app/ApiStatus';
import { fakeClaimPack, fakeShowcasePack } from './dev/fakePack';
import { EventBus } from './game/EventBus';
import { PackOpenEvents, type PackShowPayload } from './game/events';

// Phase 1: packs are faked in the browser. In Phase 2 this becomes POST /packs/daily/claim.
// Add ?showcase to the URL to get one card of every rarity for tuning effects.
function nextPack ()
{
    return new URLSearchParams(location.search).has('showcase') ? fakeShowcasePack() : fakeClaimPack();
}

function App()
{
    const [packDone, setPackDone] = useState(false);

    const deal = () =>
    {
        setPackDone(false);
        const payload: PackShowPayload = { cards: nextPack() };
        EventBus.emit(PackOpenEvents.Show, payload);
    };

    useEffect(() =>
    {
        const onComplete = () => setPackDone(true);
        EventBus.on(PackOpenEvents.Ready, deal);
        EventBus.on(PackOpenEvents.Complete, onComplete);
        return () =>
        {
            EventBus.off(PackOpenEvents.Ready, deal);
            EventBus.off(PackOpenEvents.Complete, onComplete);
        };
    }, []);

    return (
        <div id="app">
            <PhaserGame />
            <ApiStatus />
            {packDone && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(env(safe-area-inset-bottom),1.25rem)]">
                    <button
                        className="pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95"
                        onClick={deal}
                    >
                        Open another pack (dev)
                    </button>
                </div>
            )}
        </div>
    );
}

export default App
