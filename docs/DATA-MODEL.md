# Data model

The full derived schema of the source spreadsheet is in
[`reference/SCHEMA.md`](../reference/SCHEMA.md), which is the authority on what the file
contains. This document covers what the *app* does with it.

---

## The one structural rule

**`source` is imported truth. `progress` belongs to the app. They never mix.**

```ts
interface Job {
  id: string;                     // derived from jobNumber — the merge key
  source: Record<string, string>; // columns A–I verbatim, in sheet order
  seq: number;
  jobNumber: string;              // the natural key
  barPair: BarPair | null;        // null → sorts into "Unplaced"
  jobType: JobType;               // derived on import
  defects: DefectCode[];
  progress: JobProgress;          // everything the app owns
  history: HistoryEntry[];
  missingSince?: string | null;   // set if a re-import no longer lists it
}
```

Everything downstream follows from that split:

- Re-importing next week's pack refreshes `source` and leaves `progress` untouched.
- Export writes `source` back verbatim in the original column order, so the file
  round-trips and the office receives something they recognise.
- The source spreadsheet has **no** progress columns at all. `Ready to Activate`,
  `Test Status`, `Notes`, `Completed By`, the timestamps, and `VERT` / `UP` exist only
  here.

The only sanctioned write to `source` is `correctSourceValue()`, used to fix the two
malformed rows in the pack. It re-derives the bar pair and clears the matching defect
flag, so a corrected row stops showing "needs attention" and starts sorting into its real
frame position.

## Status is derived, never stored

```ts
type JobStatus = 'outstanding' | 'activated' | 'failed' | 'tested' | 'completed';
```

`deriveStatus(progress)` is a pure function of the progress fields. There is no `status`
field anywhere, because a stored status is a second source of truth and it drifts.

### The three gates

The pack is an equipment migration, which is why the workflow has three gates rather than
a done/not-done flag:

```
outstanding ──▶ activated ──▶ tested ──▶ completed
     │              │            │
     └──────────────┴────────────┴──▶ failed   (at any gate)
```

`currentGate(progress)` returns the gate a tick or a cross applies to *right now*. That is
what makes one-tap work: he never picks a gate, the app knows which one is next. A failed
job re-opens at the gate that failed.

**Timestamps are written by the app, never typed.** Setting a gate writes its timestamp;
clearing it clears the timestamp. Both directions.

Everything is revertible one gate at a time. The transition table lives in
`src/data/transitions.ts` with its own unit tests.

## Derived fields

### `jobType` — 217 / 222 / 3 in the real pack

Not a column. Derived from whether the tie columns are populated:

| Type | Meaning | Work |
|---|---|---|
| `no-ties` | Direct MDF jumper — bar pair straight to new equipment | Shorter |
| `ed-side` | Tie-cable route via E-side and D-side references | Longer |
| `llu` | LLU tie format (`…I` in, `…O` out) | Rare, likely different |

Roughly half the pack is materially more work than the other half, so it is badged on the
card and filterable — a day can be planned around it.

### `barPair` — the key to work order

`<frame>/<block><number>` parses to `{ frame, block, number }`, with `number` numeric so
`A10` sorts after `A9`.

This is the single highest-value transformation in the app. It turns "the order the office
typed it" into "the order he physically walks the frame". It is the **default** sort.

An unparseable value (the real pack has one row holding a bare `0`) parses to `null`, is
flagged `bad-barpair`, sorts into an **Unplaced** group at the end, and is correctable
in-app. It is never dropped and never crashes the import.

> If verticals do not run in alphabetical block order physically, `compareBarPair()` in
> `src/data/barPair.ts` is the one function to change — swap the block comparison for a
> lookup in a physical-order table. Nothing else depends on the assumption.

### Constant columns

A column whose value is identical on every row is detected **generically** on import,
shown once in the pack header, and kept off the card and out of the sort list. It is not
hard-coded: next week's pack may have a different one.

## Import gotchas, all handled

| Gotcha | Handling |
|---|---|
| Read the named Excel table, not the used range | Five columns after it are empty but formatted; a naive reader sees 14 columns |
| Equipment values carry a **literal leading apostrophe** in the cell value | Stripped on import. It is not an Excel quote-prefix flag, so nothing upstream removes it |
| `Circuit` is text, not a number | Every cell is read as a formatted string, so the leading `0` survives |
| Tie references contain meaningful **internal** spaces | Only the ends are trimmed |
| One row has malformed `Old_Equipment` (port segment lost) | Imports, flagged `bad-old-equipment`, correctable in-app |
| One row has a bare `0` for the bar pair | Imports, flagged `bad-barpair`, sorts to Unplaced, correctable in-app |
| A row with no job number | Imports with a positional identity, flagged `missing-job-number` |
| A duplicated job number | Both rows import, second flagged `duplicate-job-number` |

The governing rule: **a malformed row must import.** The office will still ask about that
job whether or not the spreadsheet was well-formed.

## Merge on re-import

Matched on `jobNumber`.

| Case | What happens |
|---|---|
| Job in both packs | `source` refreshes, `progress` and `history` survive untouched |
| Job only in the new pack | Added, with empty progress |
| Job only in the old pack | **Kept and flagged** `missingSince`, never deleted |

A preview states exactly this before anything commits — *"442 jobs — 0 new, 442 matched,
0 removed. Progress on 137 jobs will be kept."* Nothing is ever silently overwritten.

The column mapping is remembered per pack name, so next week is one tap.

## Storage

The whole vault — every pack, every job, settings — is serialised to JSON, encrypted as
**one** AES-GCM blob, and written to a single IndexedDB record. See
[SECURITY.md](SECURITY.md) §3 for why one blob rather than per-record.

Writes are debounced 500ms and write-through. The previous blob is pushed onto a
five-deep snapshot ring on every save.

Nothing readable is ever written to disk. That is asserted by a unit test that dumps the
whole database and greps it, and again by an e2e test that does the same in a real
browser — each with a positive control that proves the check can fail.
