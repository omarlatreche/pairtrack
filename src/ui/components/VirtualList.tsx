/**
 * Windowed list — BRIEF §7.3: "virtualise above ~200 rows so scrolling stays at
 * 60fps".
 *
 * Deliberately simple: cards are variable height, but only slightly, so an
 * estimated height plus a generous overscan is enough to keep a few hundred rows smooth
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
}

export function VirtualList<T>({ items, keyFor, renderItem }: VirtualListProps<T>) {
  const [range, setRange] = useState({ start: 0, end: VIRTUALISE_ABOVE });
  const rafPending = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const virtualise = items.length > VIRTUALISE_ABOVE;

  /**
   * Measure against the WINDOW, from this element's own position.
   *
   * This used to read `scrollTop` off a container passed in by the caller. That
   * container has `overflow-y: auto` but its height is never constrained — the
   * app shell uses `min-height: 100dvh`, so the column grows and the PAGE
   * scrolls instead. Its `scrollTop` was therefore always 0 and its `scroll`
   * event never fired, so the window never moved off the first rows: the list
   * rendered rows 0-20 inside a 73,000px spacer and everything below was blank.
   *
   * It also caused the reported bug. Marking a job scrolls the next one into
   * view, and with only the first rows ever rendered, "the next one" was always
   * near the top — so every tick threw him back to the start of the list.
   *
   * `getBoundingClientRect()` plus a capturing scroll listener works whichever
   * ancestor actually scrolls, so this cannot silently break again if the shell
   * layout changes.
   */
  useEffect(() => {
    if (!virtualise) return;

    function recompute() {
      rafPending.current = false;
      const element = viewportRef.current;
      if (element === null) return;

      const top = element.getBoundingClientRect().top;
      const scrolledPast = Math.max(0, -top);

      const first = Math.floor(scrolledPast / ESTIMATED_ROW_HEIGHT) - OVERSCAN_ROWS;
      const visible = Math.ceil(window.innerHeight / ESTIMATED_ROW_HEIGHT) + OVERSCAN_ROWS * 2;

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
    // Capture, so it fires for whichever ancestor is the real scroller.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [virtualise, items.length]);

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
    <div class="list__viewport" ref={viewportRef}>
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
