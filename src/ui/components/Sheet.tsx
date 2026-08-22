/**
 * Bottom sheet.
 *
 * Everything that asks him a question appears here rather than as a centred
 * dialog, because the bottom of the screen is where his thumb already is.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface SheetProps {
  readonly title: string;
  readonly hint?: string;
  readonly onClose: () => void;
  readonly children: ComponentChildren;
}

export function Sheet({ title, hint, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the panel so Escape works and a screen reader lands in the sheet.
    panel.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      class="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <div class="sheet__grabber" />
        <h2 class="sheet__title">{title}</h2>
        {hint !== undefined && <p class="sheet__hint">{hint}</p>}
        {children}
      </div>
    </div>
  );
}
