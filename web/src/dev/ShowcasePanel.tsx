const BUTTON = 'pointer-events-auto rounded-full bg-[#e7b54a] px-6 py-3 text-base font-bold text-[#170e10] shadow-lg active:scale-95 disabled:opacity-60';

// Dev only (?showcase): stands in for the daily pack panel on the Pack table.
export function ShowcasePanel ({ ready, onDeal }: { ready: boolean; onDeal: () => void })
{
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
            <button onClick={onDeal} disabled={!ready} className={BUTTON}>
                {ready ? 'Deal showcase pack (dev)' : 'Loading catalog…'}
            </button>
        </div>
    );
}

// Dev only (?showcase): shown under the table once every card is revealed.
export function ShowcaseAgainButton ({ onDeal }: { onDeal: () => void })
{
    return (
        <button onClick={onDeal} className={BUTTON}>
            Deal another showcase pack (dev)
        </button>
    );
}
