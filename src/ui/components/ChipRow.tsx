/**
 * A horizontally scrolling row of filter chips — BRIEF §7.4.
 *
 * The chips are wider than a phone, and the scrollbar is hidden by design
 * (a scrollbar over a 44px chip is a nuisance in gloves). That left the row
 * sliced clean through a chip at the screen edge with nothing to say it could
 * be scrolled: it read as a broken layout, and the chips past the cut were
 * close to undiscoverable.
 *
 * So the row reports which side still has chips on it, and the stylesheet
 * fades that edge. Measured rather than assumed, because how far it can scroll
 * depends on the counts in the labels and on how many frames the pack has.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

/** Which side has chips beyond the edge. */
type More = 'none' | 'start' | 'end' | 'both';

export function ChipRow({ label, children }: { label: string; children: ComponentChildren }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<More>('none');

  const measure = () => {
    const element = row.current;
    if (element === null) return;

    // 1px of slack: scrollWidth and clientWidth disagree by a sub-pixel at some
    // text sizes, which would otherwise fade an edge with nothing past it.
    const furthest = element.scrollWidth - element.clientWidth;
    if (furthest <= 1) return setMore('none');

    const atStart = element.scrollLeft <= 1;
    const atEnd = element.scrollLeft >= furthest - 1;
    setMore(atStart ? 'end' : atEnd ? 'start' : 'both');
  };

  // After every render, not just on mount: the chips themselves change as jobs
  // are ticked (the counts grow a digit) and as filters change which chips
  // exist, and both change how far the row can scroll. Re-setting the same
  // value is a no-op, so this cannot loop.
  useLayoutEffect(measure);

  useEffect(() => {
    const element = row.current;
    if (element === null) return;

    element.addEventListener('scroll', measure, { passive: true });
    // Rotating the phone changes the width without changing the content.
    window.addEventListener('resize', measure);
    return () => {
      element.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div ref={row} class="chiprow" data-more={more} role="group" aria-label={label}>
      {children}
    </div>
  );
}
