// Shown over the merge board when its cards couldn't be loaded.
export function BoardLoadError ({ onRetry }: { onRetry: () => void })
{
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center px-4">
            <p role="alert" className="pointer-events-auto rounded-2xl border border-[#3b2529] bg-[#1c1215]/95 px-5 py-4 text-sm text-[#bba595]">
                Couldn't load your cards.{' '}
                <button className="text-[#e7b54a] underline" onClick={onRetry}>Retry</button>
            </p>
        </div>
    );
}
