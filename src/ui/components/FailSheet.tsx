/**
 * One-tap fail reasons — BRIEF §7.6.
 *
 * "A fail must be as fast as a pass, or he will not record it properly." So:
 * a sheet of thumb-sized canned reasons, plus Other with free text, and a
 * "no reason" escape so a fail is never blocked by having to explain it.
 *
 * The stored value is the reason CODE, never the label (D11).
 */
import { useState } from 'preact/hooks';
import { OTHER_REASON_CODE } from '../../data/failReasons';
import type { FailReason } from '../../data/types';
import { Sheet } from './Sheet';

interface FailSheetProps {
  readonly jobNumber: string;
  readonly reasons: FailReason[];
  readonly onPick: (code: string | null, note: string | null) => void;
  readonly onClose: () => void;
}

export function FailSheet({ jobNumber, reasons, onPick, onClose }: FailSheetProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  const enabled = reasons.filter((reason) => reason.enabled);

  return (
    <Sheet
      title={`Fail ${jobNumber}`}
      hint="Tap a reason. You can change it later on the job."
      onClose={onClose}
    >
      {!otherOpen && (
        <>
          {enabled.map((reason) => (
            <button
              key={reason.code}
              type="button"
              class="sheet__option sheet__option--danger"
              onClick={() => onPick(reason.code, null)}
            >
              {reason.label}
            </button>
          ))}

          <button type="button" class="sheet__option" onClick={() => setOtherOpen(true)}>
            Other — type a reason
          </button>

          <button type="button" class="sheet__option" onClick={() => onPick(null, null)}>
            Fail without a reason
          </button>
        </>
      )}

      {otherOpen && (
        <>
          <label class="field">
            <span class="field__label">What went wrong?</span>
            <textarea
              class="textarea"
              value={otherText}
              autofocus
              onInput={(event) => setOtherText((event.target as HTMLTextAreaElement).value)}
            />
            <p class="field__hint">This is saved to the job&rsquo;s notes.</p>
          </label>

          <button
            type="button"
            class="button button--danger"
            onClick={() => onPick(OTHER_REASON_CODE, otherText.trim() === '' ? null : otherText.trim())}
          >
            Mark failed
          </button>
          <button type="button" class="button" onClick={() => setOtherOpen(false)}>
            Back to the list
          </button>
        </>
      )}
    </Sheet>
  );
}
