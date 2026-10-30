import { useEffect, useRef, useState } from 'react';
import { CARD_W, drawCardFace } from '../../game/cards/drawCard';
import type { CardData } from '../../game/cards/model';
import { loadSpiritArt } from '../../game/cards/spiritImages';

/**
 * A card face drawn with the same renderer as the game table, as an <img>.
 * Drawn only when it scrolls near the screen (unless `eager`), and kept as an
 * encoded image (not a live canvas) so a long collection doesn't hold hundreds of canvases.
 */
export function CardImage ({ card, eager = false, className = '' }: { card: CardData; eager?: boolean; className?: string })
{
    const box = useRef<HTMLDivElement>(null);
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() =>
    {
        const el = box.current;
        if (!el)
        {
            return;
        }
        let url: string | null = null;
        let cancelled = false;

        const draw = async () =>
        {
            await loadSpiritArt(); // painted creatures, before the face is drawn
            if (cancelled)
            {
                return;
            }
            // Device pixels across the card, capped: thumbnails don't need print quality.
            const scale = Math.min(3, Math.max(0.5, (el.clientWidth * window.devicePixelRatio) / CARD_W));
            drawCardFace(card, scale).toBlob(blob =>
            {
                if (blob && !cancelled)
                {
                    url = URL.createObjectURL(blob);
                    setSrc(url);
                }
            }, 'image/webp', 0.9);
        };

        if (eager)
        {
            void draw();
            return () =>
            {
                cancelled = true;
                if (url)
                {
                    URL.revokeObjectURL(url);
                }
            };
        }

        // The margin only works against the element that scrolls (it clips the viewport's view).
        const seen = new IntersectionObserver(entries =>
        {
            if (entries.some(e => e.isIntersecting))
            {
                seen.disconnect();
                void draw();
            }
        }, { root: el.closest('[data-scroll-root]'), rootMargin: '600px 0px' });
        seen.observe(el);

        return () =>
        {
            cancelled = true;
            seen.disconnect();
            if (url)
            {
                URL.revokeObjectURL(url);
            }
        };
    }, [card, eager]);

    return (
        <div ref={box} className={`aspect-[5/7] w-full ${className}`}>
            {src
                ? <img src={src} alt={card.name} className="h-full w-full" draggable={false} />
                : <div className="h-full w-full animate-pulse rounded-[6%] bg-white/5" />}
        </div>
    );
}
