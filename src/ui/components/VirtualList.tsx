/**
 * Windowed list — BRIEF §7.3: "virtualise above ~200 rows so scrolling stays at
 * 60fps".
 *
 * Deliberately simple: cards are variable height, but only slightly, so an
 * estimated height plus a generous overscan is enough to keep 442 rows smooth
 * without the complexity (and the scroll-anchoring bugs) of a measuring
 * virtualiser. Below the threshold everything renders, because 200 cards cost
 * nothing and un-virtualised scrolling is always smoother.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** Roughly a card with two chip rows. Overscan absorbs the error. */
const ESTIMATED_ROW_HEIGHT = 168;
const OVERSCAN_ROWS = 6;
const VIRTUALISE_ABOVE = 200;

interface VirtualListProps<T> {
  readonly items: T[];
  readonly keyFor: (item: T) => string;
  readonly renderItem: (item: T) => ComponentChildren;
  /** The scrolling element. */
  readonly scrollRef: { current: HTMLElement | null };
}

export function VirtualList<T>({ items, keyFor, renderItem, scrollRef }: VirtualListProps<T>) {
  const [range, setRange] = useState({ start: 0, end: VIRTUALISE_ABOVE });
  const rafPending = useRef(false);

  const virtualise = items.length > VIRTUALISE_ABOVE;

  useEffect(() => {
    if (!virtualise) return;

    const scroller = scrollRef.current;
    if (scroller === null) return;

    function recompute() {
      rafPending.current = false;
      const element = scrollRef.current;
      if (element === null) return;

      const first = Math.floor(element.scrollTop / ESTIMATED_ROW_HEIGHT) - OVERSCAN_ROWS;
      const visible = Math.ceil(element.clientHeight / ESTIMATED_ROW_HEIGHT) + OVERSCAN_ROWS * 2;

      const start = Math.max(0, first);
      const end = Math.min(items.length, start + visible);

      setRange((current) => (current.start === start && current.end === end ? current : { start, end }));
    }

    function onScroll() {
      if (rafPending.current) return;
      rafPending.current = true;
      requestAnimationFrame(recompute);
    }

    recompute();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [virtualise, items.length, scrollRef]);

  if (!virtualise) {
    return (
      <div class="list__viewport">
        {items.map((item) => (
          <div key={keyFor(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  const start = Math.min(range.start, Math.max(0, items.length - 1));
  const end = Math.min(range.end, items.length);
  const visible = items.slice(start, end);

  return (
    <div class="list__viewport">
      {/* Spacers keep the scrollbar honest without rendering the rows. */}
      <div style={{ height: `${start * ESTIMATED_ROW_HEIGHT}px` }} aria-hidden="true" />
      {visible.map((item) => (
        <div key={keyFor(item)}>{renderItem(item)}</div>
      ))}
      <div
        style={{ height: `${Math.max(0, items.length - end) * ESTIMATED_ROW_HEIGHT}px` }}
        aria-hidden="true"
      />
    </div>
  );
}
