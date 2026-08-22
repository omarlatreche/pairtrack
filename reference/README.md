# PairTrack — reference pack

Everything in this folder is **input for Claude Code**. It is the visual record of the
tool the job pack is currently managed with, captured from a phone screen recording.

Nothing here is a design to copy verbatim. It is a record of *what data exists* and
*which interactions matter*. PairTrack should improve on it — see `BRIEF.md`.

> **Note:** the screenshots show a third-party tool at `<third-party-tool redacted>`. It is
> reference only. Do not copy its branding, name, logo or wording.

---

## screenshots/

| File | What it shows |
|---|---|
| `01-whatsapp-brief-original-request.png` | The original ask: "make this into an app so I can tick/fail jobs and sort by ascending/descending". Also names the source spreadsheet: `<pack-file redacted>`, 1 sheet, 58 KB. |
| `02-job-list-main-view.png` | Main screen. Stage buttons (`Test Submit`, `Completed Submit`), a three-stage tracker (`Activation pending → Test pending → Completed pending`), search box, filter dropdown, and the jobs table with sort carets. 442 jobs. |
| `03-filter-dropdown-all-my-completed-outstanding-locked.png` | The filter set in use: **All Jobs (442) / My Jobs (0) / Completed (0) / Outstanding (442) / Locked (0)**, each with a live count. |
| `04-table-columns-barpair-vert-up-eside-click-to-edit.png` | Mid-table columns: `… BAR PAIR`, `VERT`, `UP`, `ESIDE T…`. Cells read "Click to edit" — inline editing. Sample values `…</BAR-PAIR redacted>`, `…</BAR-PAIR redacted>`, `…</BAR-PAIR redacted>`, `…</BAR-PAIR redacted>` and E-side refs `<eside-ref redacted>…`, `<eside-ref redacted>…`. |
| `05-ready-to-activate-cell-empty.png` | The `READY TO ACTIVATE` column in its default `--` state, next to `ACTIVATION TIMESTAMP`. |
| `06-ready-to-activate-options-yes-failed.png` | The tick/fail control. Exactly three values: `--`, `Yes`, `Failed`. **This is the core interaction the whole app exists for.** |
| `07-ready-to-activate-yes-with-timestamp.png` | After selecting `Yes`: the row highlights and `ACTIVATION TIMESTAMP` auto-fills `20/08/2026, 10:33`. Timestamps are written by the app, not typed. |
| `08-test-status-notes-completed-by-columns.png` | Tail columns: `TEST STATUS`, `NOTES` (click to edit), `COMPLETED BY`. |

## video-frames/

Frames pulled from `<source-recording redacted>` (22s, portrait phone
capture). They pan horizontally across the full table, which is the clearest record
of the column order.

| File | What it shows |
|---|---|
| `01-columns-job-jobnumber-db.png` | Left-most columns: lock icon, `JOB` (row index 1,2,3,4), `JOB NUMBER` (`<job-ref redacted>`, `<job-ref redacted>`, `<job-ref redacted>`, `<job-ref redacted>`), `DB` (`LW`). |
| `02-columns-barpair-vert-up-eside.png` | `… BAR PAIR`, `VERT`, `UP`, `ESIDE T…` with "Click to edit" placeholders. |
| `03-columns-ready-to-activate-activation-timestamp.png` | `READY TO ACTIVATE` select controls down the rows, `ACTIVATION TIMESTAMP` blank (`-`). |
| `04-ready-to-activate-dropdown-yes-failed.png` | Native picker open: `--` / `Yes` / `Failed`, with the resulting timestamp visible behind it. |
| `05-columns-notes-completedby-timestamp.png` | `NOTES`, `COMPLETED BY`, `TIMESTAMP`. |
| `06-top-of-page-submit-buttons-and-stage-tracker.png` | Header, `Live` sync pill, `Last sync: 10:33:11`, locked submit buttons. |
| `07-filter-and-search-controls.png` | Search + filter controls above the table. |

---

## Column order observed, left to right

```
🔒(lock)  JOB  JOB NUMBER  DB  …  … BAR PAIR  VERT  UP  ESIDE T…
READY TO ACTIVATE  ACTIVATION TIMESTAMP  TEST STATUS  NOTES  COMPLETED BY  TIMESTAMP
```

The real spreadsheet has since been analysed — see **`SCHEMA.md`** in this folder for
the authoritative column list. The short version: the sheet has only **9 columns**
(`JOB`, `Job Number`, `DB`, `Circuit`, `MDF BAR PAIR`, `ESIDE TIES`, `DSIDE TIES`,
`New_Equipment`, `Old_Equipment`). Everything from `READY TO ACTIVATE` rightwards in
these screenshots — plus `VERT` and `UP` — is **added by the tool**, not present in the
source file.

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
- **Requires a live connection** (`Live` pill, `Last sync`). Exchange basements,
  footway boxes and chambers do not have signal. PairTrack must work fully offline.
