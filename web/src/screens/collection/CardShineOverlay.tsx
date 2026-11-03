import { useEffect, useRef } from 'react';
import type { CardData } from '../../game/cards/model';
import { SHINE_BAND_ANGLE, SHINE_BAND_H, SHINE_BAND_W, shineBand, shineLoop } from '../../game/cards/shineModel';

/**
 * The table's shine for a React card: a light band that sweeps across now and then, masked by
 * the card's glint image (pattern lines + rim), so only the pattern catches the light. Runs on
 * the compositor (Web Animations, transform only) and pauses while the card is off screen.
 */
export function CardShineOverlay ({ card, glint }: { card: CardData; glint: string })
{
    const box = useRef<HTMLDivElement>(null);
    const band = useRef<HTMLDivElement>(null);

    useEffect(() =>
    {
        const el = box.current;
        const b = band.current;
        if (!el || !b || typeof b.animate !== 'function')
        {
            return;
        }
        const loop = shineLoop(card.rarity);
        const at = (pct: number) => `translateX(${pct}%) rotate(${SHINE_BAND_ANGLE}deg)`;
        const anim = b.animate([
            { transform: at(-loop.travelPct), offset: 0, easing: 'ease-in-out' },
            { transform: at(loop.travelPct), offset: loop.sweepEnd },
            { transform: at(loop.travelPct), offset: 1 }
        ], { duration: loop.duration, delay: loop.delay, iterations: Infinity });
        anim.pause();

        const seen = new IntersectionObserver(entries =>
        {
            const on = entries[entries.length - 1]?.isIntersecting;
            if (on)
            {
                anim.play();
            }
            else
            {
                anim.pause();
            }
        }, { root: el.closest('[data-scroll-root]') });
        seen.observe(el);
        return () =>
        {
            seen.disconnect();
            anim.cancel();
        };
    }, [card.rarity]);

    const { alpha } = shineLoop(card.rarity, () => 0);
    const look = shineBand(card.season?.art.foil ?? 'none');
    const mask = `url(${glint})`;
    return (
        <div
            ref={box}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{
                opacity: alpha,
                mixBlendMode: 'plus-lighter',
                maskImage: mask,
                WebkitMaskImage: mask,
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%'
            }}
        >
            <div
                ref={band}
                className="absolute"
                style={{
                    width: `${SHINE_BAND_W * 100}%`,
                    height: `${SHINE_BAND_H * 100}%`,
                    left: `${50 - (SHINE_BAND_W * 100) / 2}%`,
                    top: `${50 - (SHINE_BAND_H * 100) / 2}%`,
                    background: look.background,
                    maskImage: look.mask ?? undefined,
                    WebkitMaskImage: look.mask ?? undefined,
                    transform: `translateX(-400%)`
                }}
            />
        </div>
    );
}
