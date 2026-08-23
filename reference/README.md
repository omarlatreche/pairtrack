# PairTrack — reference pack

<!-- Every job reference, bar pair and equipment ref in this file is FABRICATED.
     Asserted deliberately so the scanner runs its patterns here rather than
     skipping the file by path — a blanket exemption is what let two real
     values sit in this file unnoticed on a public remote.
     no-data-scan: synthetic -->

This folder is the written record of the tool the job pack is currently managed with,
captured from a phone screen recording. It records *what data exists* and *which
interactions matter*. Nothing here is a design to copy verbatim — PairTrack should
improve on it, see `BRIEF.md`.

## The screenshots have been removed — 2026-08-23

This folder used to hold 15 PNG screenshots and video frames of the live third-party
tool. They were removed from the tree **and from git history**, because between them
they showed:

- the full name of a named individual, in the app header of 8 of them
- the third-party tool's internal domain, and the exchange name
- four real job references and four real MDF bar pairs — both of which match patterns
  `scripts/no-data-scan.mjs` bans outright in text
- partially legible real equipment references, and the real job-pack filename

No customer telephone numbers were visible in any of them; the `Circuit` column never
appeared in frame. That is the pattern the scanners mark `neverExempt`, and it held.

**Why no scanner caught this.** The scanners read text. This folder's images were
additionally exempt from content scanning by name, on the reasoning that binaries could
not be scanned anyway — true, and precisely the hole. The only control was the BRIEF §9.8
judgement call, and it was made against an inventory that recorded "four job numbers" and
missed the person's name entirely.

`scripts/no-data-scan.mjs` now **forbids raster images anywhere under `reference/`**
rather than exempting them, so this cannot recur silently. The observations the images
supported are all written down below, which is what they were kept for.

---

## Column order observed, left to right

```
🔒(lock)  JOB  JOB NUMBER  DB  …  … BAR PAIR  VERT  UP  ESIDE T…
READY TO ACTIVATE  ACTIVATION TIMESTAMP  TEST STATUS  NOTES  COMPLETED BY  TIMESTAMP
```

See **`SCHEMA.md`** for the authoritative column list. The short version: the sheet has
only **9 columns** (`JOB`, `Job Number`, `DB`, `Circuit`, `MDF BAR PAIR`, `ESIDE TIES`,
`DSIDE TIES`, `New_Equipment`, `Old_Equipment`). Everything from `READY TO ACTIVATE`
rightwards — plus `VERT` and `UP` — is **added by the tool**, not present in the source
file.

## What the recording showed, screen by screen

| Screen | What it established |
|---|---|
| Main job list | Stage buttons (`Test Submit`, `Completed Submit`), a three-stage tracker (`Activation pending → Test pending → Completed pending`), search box, filter dropdown, jobs table with sort carets. 442 jobs. |
| Filter dropdown | The filter set in use: **All Jobs / My Jobs / Completed / Outstanding / Locked**, each with a live count. All 442 were `Outstanding`. |
| Left-most columns | Lock icon, `JOB` (row index), `JOB NUMBER`, `DB`. Job numbers follow the `AAA###/#` shape documented in `SCHEMA.md`. |
| Mid-table columns | `… BAR PAIR`, `VERT`, `UP`, `ESIDE T…`, cells reading "Click to edit" — inline editing. Bar pairs follow the `##/A###` shape; E-side refs follow the equipment shapes in `SCHEMA.md`. |
| `READY TO ACTIVATE` | Default `--` state beside a blank `ACTIVATION TIMESTAMP`. |
| The tick/fail control | A native picker with exactly three values: `--`, `Yes`, `Failed`. **This is the core interaction the whole app exists for.** |
| After selecting `Yes` | The row highlights and `ACTIVATION TIMESTAMP` auto-fills. Timestamps are written by the app, not typed. |
| Tail columns | `TEST STATUS`, `NOTES` (click to edit), `COMPLETED BY`, `TIMESTAMP`. |
| Header | A `Live` sync pill and a `Last sync:` label — the always-online assumption PairTrack rejects. |

The original ask, from the message that started this: make it into an app to tick/fail
jobs and sort ascending/descending.

## What the screen recording proves about the workflow

1. One job pack per exchange per week: **442 jobs**, all `Outstanding`, none started.
2. Three sequential gates per job: **Ready to activate → Test → Completed**, each with
   its own auto-written timestamp and its own submit action.
3. `Ready to activate` is a three-state field, not a checkbox: unset / `Yes` / `Failed`.
4. Jobs can be **locked** (a lock column and a `Locked` filter exist) — in the original
   this is multi-engineer claiming. PairTrack v1 is single-engineer, so lock becomes a
   local "don't touch this row" guard. Confirm with the engineer before building it.
5. `VERT` and `UP` show "Click to edit" and are **absent from the source file** — the
   engineer fills them in on site, or the tool expects him to.
6. Every column is sortable and every editable cell is inline ("Click to edit").

## What is wrong with it, and what PairTrack must do better

- **15+ columns on a 6" phone.** The recording is 22 seconds of horizontal scrolling
  just to reach the one control that matters. A table is the wrong primary layout on a
  phone. Cards first; table only on wide screens.
- **Native select for the key action.** Two taps and a modal picker per job, ×442.
  It should be one thumb-sized tap.
- **No physical work order.** Jobs are listed by row index, not by position on the
  frame, so the engineer walks the frame in spreadsheet order.
- **A `Live` pill and a sync clock.** It assumes a network that is not there. PairTrack
  is offline-first and says so — see D-decisions in `docs/DECISIONS.md`.
