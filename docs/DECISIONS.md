# Decisions

One entry per decision that a future maintainer would otherwise have to re-derive.
Working notes live in the untracked `SESSION.md`; settled decisions get promoted here.

---

## D1 — Preact, not React

**Chosen:** Preact 10 with hooks, no `preact/compat`.

**Why:** ~4KB of runtime against React's ~45KB. This app is installed over patchy signal
and every version bump re-downloads the shell. The API surface used here (hooks, JSX,
context) is identical, and nothing in the dependency list needs React internals. If a
React-only library ever becomes necessary, `preact/compat` is an aliasing change in
`vite.config.ts`, not a rewrite.

## D2 — No state-management library

**Chosen:** a small hand-written store in `src/state/` — a plain object, a `Set` of
subscribers, and a `useStore` hook.

**Why:** the whole application state is one pack of jobs plus a view spec (sort, filter,
search). Redux, Zustand or Jotai would all be more code to audit than the thing they
manage. BRIEF §6 rules them out anyway; this records that the constraint was the right
call rather than a limitation worked around.

## D3 — The whole store is encrypted as one blob

**Chosen:** serialise the pack to JSON, encrypt once, write one record.

**Why:** 442 jobs is well under 1MB, so there is no performance argument for per-record
encryption. One blob means one IV per write instead of 442, which is a much smaller
surface for the one mistake that breaks AES-GCM. It also hides the record count, which
per-record encryption would leak.

**Cost:** every save rewrites the whole blob. Measured at well under 20ms for 442 jobs,
and writes are debounced 500ms, so it does not matter.

## D4 — Backgrounding does not lock instantly

**Chosen:** 15 minutes idle (configurable 1–60), 5 minutes hidden.

**Why:** locking the moment the app is backgrounded looks more secure and is less secure
in practice. He switches to the camera, or answers a text, mid-job. Re-entering a
12-character passphrase in gloves every time would make him stop using the app — and an
app he does not use protects nothing. Five minutes is short enough that a phone left on a
bench locks itself, long enough that ordinary app-switching does not punish him.

## D5 — No wipe after N failed unlock attempts

**Chosen:** escalating delay, capped at 60s. Never a wipe.

**Why:** the realistic scenario is him, cold and wet, mistyping his own passphrase — not
an attacker brute-forcing 600,000-iteration PBKDF2 by hand on a touchscreen. Losing a
day's ticks to a fat-fingered unlock is the bigger real risk.

## D6 — SheetJS is dynamically imported

**Chosen:** `await import('xlsx')` inside the import and export paths; a separate
`sheetjs` chunk; precached by the service worker.

**Why:** ~900KB of the bundle serves two screens he visits once a week. Keeping it out of
the main chunk keeps first paint and every subsequent launch fast. Precaching keeps it
available in aeroplane mode, which is the normal case.

## D7 — Frame-walk order is the default sort

**Chosen:** frame → block → numeric pair, ascending, as the default; sheet order is
available but is not the default.

**Why:** the pack arrives in the order the office generated it, which bears no relation
to the order the frame is physically walked. Sorting by parsed bar pair means the list
follows his feet. This is the single highest-value transformation in the app.

**Assumption to confirm (BRIEF §14 Q1):** that verticals run in alphabetical block order.
If the physical order differs, the fix is the block-rank table in `src/data/sort.ts` and
nothing else.

## D8 — Cards on phones, table only at ≥900px

**Chosen:** a card list as the only phone layout; the full sortable table appears at
≥900px over the same store.

**Why:** the reference recording is 22 seconds of horizontal scrolling to reach the one
control that matters. Fifteen columns do not fit a 6" screen and never will. The table is
kept for desk review because that is where it is genuinely better.

## D9 — Status is derived, never stored

**Chosen:** `JobStatus` is a pure function of the progress fields.

**Why:** a stored status is a second source of truth that drifts. Deriving it means a
gate change cannot leave the badge wrong, and the transition table has one home
(`src/data/transitions.ts`) with its own unit tests.

## D10 — Hosting: build for all three options

**Chosen:** `PAIRTRACK_BASE` env var drives Vite's `base`; relative asset paths
throughout; a `_headers` file for Cloudflare and equivalent meta CSP for Pages.

**Why:** BRIEF §8 is right that "private repo → GitHub Pages" does not exist on a free
account and would not give privacy if it did. The repository never contains job data, so
repository visibility is not the security boundary — the encryption is. Option A (public
repo + Pages) is the recommended default and what `deploy.yml` is configured for; option
C (Cloudflare Pages + Access) needs only `PAIRTRACK_BASE=/` and is the strongest if he
wants a login gate in front of the whole site.

**Awaiting his choice (BRIEF §14 Q10).**

## D11 — Fail reasons are stored as codes, not labels

**Chosen:** `failReason` holds a stable code (`bar-pair-not-as-documented`); labels live
in a table the engineer can edit in settings.

**Why:** BRIEF §7.6 is explicit that the starting list was written by someone who has not
done the job and needs his real wording. Storing codes means changing a label is a text
edit, not a data migration.

## D12 — `locked` kept, repurposed

**Chosen:** keep the field; it means "don't touch this row", locally, for one engineer.

**Why:** in the original tool this was multi-engineer claiming, which is out of scope. But
a "leave this one alone, I'm waiting on the office" marker is genuinely useful to a lone
engineer, the filter already exists in the UI he knows, and the field costs nothing.

**To confirm (BRIEF §14 Q8):** whether he wants it at all.

## D13 — Re-keying is one IndexedDB transaction

**Chosen:** `saveVaultAndMeta()` writes the re-encrypted blob and the new
verifier in a single `readwrite` transaction across both stores.

**Why:** as two separate writes, an interruption between them leaves ciphertext
under the new key beside a verifier for the old passphrase. The old passphrase
then passes the verifier and decrypts nothing; the new one fails the verifier
outright. **Neither passphrase works**, there is no reset, and the app has no way
to explain it — he would reasonably conclude he had forgotten his own
passphrase and that a week of work was his fault. It is the single worst failure
the app can have, and it costs one transaction to make impossible.

Corollary: an unlock that passes the verifier and *still* cannot decrypt is now
reported explicitly, pointing at the backup. Silence there is what turns a
recoverable problem into a lost pack.

## D14 — The importer reads cells by column index, never by header name

**Chosen:** `sheet_to_json` in matrix mode (`header: 1`), addressed by index.

**Why:** object mode keys each row by the header cell value *verbatim* — SheetJS
does not trim. Trim the header list for display, then use the trimmed name to
read a cell, and every lookup on a header carrying a trailing space returns
`undefined`. That column becomes empty on all 442 rows with nothing reported,
because the other columns still have values so the row is not blank.

The pack is generated by Power Query, where a header inheriting whitespace from
an upstream source is routine. On `Circuit` it would silently erase 442
telephone numbers; on `Job Number` it destroys the natural key and next week's
re-import keeps nothing. Index addressing is also immune to repeated headers,
which object mode quietly renames to `Name_1`.

## D15 — Every lock path flushes first, and the store drops plaintext on lock

**Chosen:** the header lock button, Settings → Lock now, and both auto-lock
timers all flush before locking; `repository.ts` additionally clears its pending
buffer on the lock event.

**Why:** two separate problems met in the same place. A lock inside the 500ms
debounce window wrote *after* the key was gone, so the write failed and the
change was lost. And the failed write left `pending` holding a **fully decrypted
vault** — every job number, every note, all 442 circuit numbers — alive on the
heap through the lock screen and beyond, which contradicts §9.4 outright.

The flush fixes the loss; the backstop means the retention cannot come back
through some future code path that forgets to flush. `src/crypto/` still does
not import `src/data/` — `main.tsx` injects the flush — so the crypto module
stays reviewable on its own (BRIEF §10.1).

## D16 — `flushSave()` rejects on failure

**Chosen:** it throws rather than swallowing, and only restores the pending
vault when nothing newer has arrived.

**Why:** it used to catch and log, so it resolved even when nothing reached
disk. Every caller that checked the result was being told a comforting lie —
the import screen's "could not save" branch was literally unreachable. A
write-through that cannot report a failed write is not write-through (§3.6).
The unconditional restore was a second bug: it discarded a tick made while the
failed write was in flight, leaving that tick on screen and in memory but never
on disk.

## D17 — Done / not done, then batch sign-off. No job detail screen.

**Chosen:** one tap on a card marks a job done. Done jobs collect in a *pending*
pile. A single batch action signs the whole pile off. There is no job detail
screen and no way to open a job at all.

**Why:** the engineer used it and said it was too complicated. His words: he
should not have to click a job to see its details, should not have to click jobs
at all, wants done/not done with no notes, and wants every field on the front
screen.

That is not a UI preference, it invalidates several things built on assumptions
never confirmed with him:

- The **three gates** (Ready to activate → Test → Completed) were modelled from
  the old tool's columns. He wants one state change. The gates were three taps
  and three decisions where he had one.
- **Notes**, **fail reasons** (D11) and **VERT/UP** (§14 Q2) all existed only
  because a detail screen existed. VERT/UP were never in the source file and were
  never confirmed with him — assumption §14 Q2, now answered: drop them.
- **`locked`** (D12) was kept on the guess that a "don't touch" marker was
  useful. §14 Q8 asked whether he wanted it at all. He did not mention it, and it
  is per-job furniture on a screen he wants uncluttered. Removed.
- The **failed** state goes. Asked directly, he wants two states. A job he could
  not do stays not-done and he tells the office. This removes the fail sheet, the
  editable reason list and every failed branch in the transition table.

**The batch sign-off is not new.** The old tool had `Test Submit` and
`Completed Submit` buttons and a three-stage pending tracker. He is asking for
the workflow he already knows, minus the per-job fiddliness — which is a much
better signal than a request for something novel.

**`JOB` is what he reads; `Job Number` is still the key.** He said job is the
important identifier, not job number. Column A (`JOB`) is a row index 1–442 and
`SCHEMA.md` is explicit that it is **not an identifier** — it is not stable when
next week's pack is regenerated. So the two are separated: `JOB` is what the card
leads with and what he searches, `Job Number` stays the natural key for re-import
matching. Keying re-import on a row index would silently move his ticks onto
different circuits, which is the exact silent-loss failure this project keeps
finding.

**Timestamps:** he said only the completed timestamp matters, so that is the only
one written, stamped when he taps at the frame rather than when the batch is
signed off — the time the work happened is the true one.

**Open with the office:** `READY TO ACTIVATE`, `ACTIVATION TIMESTAMP` and
`TEST STATUS` therefore export **blank**. Writing `Yes`/`Pass` into them would
make the sheet look complete, but it would assert a test that nobody performed,
and this is a telecoms record. Blank and honest until the office says otherwise.

---

## Deferred — explicitly not built in v1 (BRIEF §12)

| Deferred | Note |
|---|---|
| Multi-engineer sync, shared job pools, real job locking | Needs a backend, which is the one thing this design does not have. |
| Photo / evidence capture | Storage, encryption of blobs, and a UI. Real work, no demand yet. |
| Copper test-result interpretation (IR, loop resistance, capacitance-to-distance) | Interesting, but safety-adjacent. It needs the engineer's sign-off before it goes near a real job. |
| Maps, routing, mileage | Needs network and a tile provider. Both are ruled out by §3.2. |
| Push notifications, email, any Kelly Group / Openreach integration | Needs a backend and an account. |
