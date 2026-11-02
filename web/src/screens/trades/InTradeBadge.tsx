/** A label over a card locked in an open offer. */
export function InTradeBadge ({ text = 'In trade' }: { text?: string })
{
    return (
        <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/75 px-1 py-0.5 text-center text-[10px] font-bold text-[#e7b54a]">{text}</span>
    );
}
