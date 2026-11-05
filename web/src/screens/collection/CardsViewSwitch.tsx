import type { CardsView } from '../../app/cardsView';

const VIEWS: { view: CardsView; label: string }[] = [
    { view: 'MergeBoard', label: 'Board' },
    { view: 'Collection', label: 'List' }
];

// The Cards tab's two views of the same cards: the merge Board and the full List.
// Sits in the same spot on both, so it doesn't jump when switching.
export function CardsViewSwitch ({ view, onChange }: { view: CardsView; onChange: (view: CardsView) => void })
{
    return (
        <div role="group" aria-label="Cards view" className="pointer-events-auto flex shrink-0 rounded-xl border border-[#3b2529] bg-[#22151a]/95 p-0.5">
            {VIEWS.map(v => (
                <button
                    key={v.view}
                    data-tutorial={`view-${v.view}`}
                    onClick={() => onChange(v.view)}
                    aria-pressed={view === v.view}
                    className={`rounded-[10px] px-4 py-1.5 text-sm font-bold ${
                        view === v.view ? 'bg-[#e7b54a] text-[#170e10]' : 'text-[#bba595] active:bg-white/5'
                    }`}
                >
                    {v.label}
                </button>
            ))}
        </div>
    );
}
