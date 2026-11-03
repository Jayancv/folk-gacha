import { useEffect, useRef, useState } from 'react';
import { CARD_W, drawCardFace, drawCardGlint } from '../../game/cards/drawCard';
import type { CardData } from '../../game/cards/model';
import { prefersReducedMotion } from '../../game/cards/revealFx';
import { loadSpiritArt } from '../../game/cards/spiritImages';
import { CardShineOverlay } from './CardShineOverlay';

/**
 * A card face drawn with the same renderer as the game table, as an <img>.
 * Drawn only when it scrolls near the screen (unless `eager`), and kept as an
 * encoded image (not a live canvas) so a long collection doesn't hold hundreds of canvases.
 * Cards with season art shine now and then like on the table (not with reduced motion).
 */
export function CardImage ({ card, eager = false, className = '' }: { card: CardData; eager?: boolean; className?: string })
{
    const box = useRef<HTMLDivElement>(null);
    const [src, setSrc] = useState<string | null>(null);
    const [glint, setGlint] = useState<string | null>(null);

    useEffect(() =>
    {
        const el = box.current;
        if (!el)
        {
            return;
        }
        let url: string | null = null;
        let glintUrl: string | null = null;
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
            if (!prefersReducedMotion())
            {
                // The shine mask only shapes a soft band: low resolution is enough.
                drawCardGlint(card, Math.min(1, scale))?.toBlob(blob =>
                {
                    if (blob && !cancelled)
                    {
                        glintUrl = URL.createObjectURL(blob);
                        setGlint(glintUrl);
                    }
                }, 'image/webp', 0.8);
            }
        };
        const release = () =>
        {
            cancelled = true;
            for (const u of [url, glintUrl])
            {
                if (u)
                {
                    URL.revokeObjectURL(u);
                }
            }
        };

        if (eager)
        {
            void draw();
            return release;
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
            seen.disconnect();
            release();
        };
    }, [card, eager]);

    return (
        <div ref={box} className={`relative aspect-[5/7] w-full ${className}`}>
            {src
                ? <img src={src} alt={card.name} className="h-full w-full" draggable={false} />
                : <div className="h-full w-full animate-pulse rounded-[6%] bg-white/5" />}
            {src && glint && <CardShineOverlay card={card} glint={glint} />}
        </div>
    );
}
