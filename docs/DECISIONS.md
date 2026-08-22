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

---

## Deferred — explicitly not built in v1 (BRIEF §12)

| Deferred | Note |
|---|---|
| Multi-engineer sync, shared job pools, real job locking | Needs a backend, which is the one thing this design does not have. |
| Photo / evidence capture | Storage, encryption of blobs, and a UI. Real work, no demand yet. |
| Copper test-result interpretation (IR, loop resistance, capacitance-to-distance) | Interesting, but safety-adjacent. It needs the engineer's sign-off before it goes near a real job. |
| Maps, routing, mileage | Needs network and a tile provider. Both are ruled out by §3.2. |
| Push notifications, email, any Kelly Group / Openreach integration | Needs a backend and an account. |
