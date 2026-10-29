// Text fitting for card faces. Takes anything with measureText (a canvas 2D context in
// the game, a fake in tests) so it can be unit tested without a canvas.

export interface TextMeasurer
{
    measureText (text: string): { width: number };
}

/** Shortens text with an ellipsis until it fits in maxW. */
export function ellipsize (ctx: TextMeasurer, text: string, maxW: number): string
{
    if (ctx.measureText(text).width <= maxW)
    {
        return text;
    }
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW)
    {
        t = t.slice(0, -1);
    }
    return t.trimEnd() + '…';
}

/** Word-wraps into at most maxLines; the last line is ellipsized if text remains. */
export function wrap (ctx: TextMeasurer, text: string, maxW: number, maxLines: number): string[]
{
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++)
    {
        const test = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(test).width <= maxW || !line)
        {
            line = test;
            continue;
        }
        if (lines.length === maxLines - 1)
        {
            lines.push(ellipsize(ctx, `${line} ${words.slice(i).join(' ')}`, maxW));
            return lines;
        }
        // A single word wider than the line is cut rather than overflowing the card.
        lines.push(ellipsize(ctx, line, maxW));
        line = words[i];
    }
    if (line)
    {
        lines.push(ellipsize(ctx, line, maxW));
    }
    return lines;
}
