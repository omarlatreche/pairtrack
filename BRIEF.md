# PairTrack — build brief for Claude Code

<!-- Every job reference, bar pair and equipment ref in this file is FABRICATED.
     Asserted deliberately so the scanner runs its patterns here rather than
     skipping the file by path — a blanket exemption is what let two real
     values sit in this file unnoticed on a public remote.
     no-data-scan: synthetic -->

> ## ⚠️ Parts of this brief are SUPERSEDED — do not build from §7 as written
>
> This is the original brief, kept as the record of what was first asked for. The
> **workflow section is no longer what the app does**, and it should not be implemented
> again from here.
>
> The three gates (*Ready to activate → Test → Completed*), the failed state, fail
> reasons, per-job notes, `VERT` / `UP`, the `locked` flag and the job detail screen were
> all built from this document and then **removed** — see `docs/DECISIONS.md` **D17**.
> The app is now: one tap marks a job done, then a batch sign-off. Nothing else.
>
> That happened because those features came from §14 assumptions that were never put to
> the person who does the job. When he was finally asked, five of the eleven questions
> were answered and **four of the answers were "no, remove it"**. The assumptions were the
> problem, not the code.
>
> **§14 is still live and still worth working through** — the remaining six questions are
> tracked in `SESSION.md`, and Q1 (does the frame walk really run in alphabetical block
> order?) is the one to ask first. `docs/DATA-MODEL.md` describes the model as it actually
> is today.

**Paste this whole file into an empty folder as `BRIEF.md`, drop the `reference/`
folder next to it, then start Claude Code in that folder and say:**

> Read `SESSION.md` if it exists, then `BRIEF.md` and everything in `reference/`.
> Ask me the questions in §14 that `SESSION.md` doesn't already answer, then build it
> phase by phase, committing as you go and keeping `SESSION.md` current.

### Starting any session, including this one — do this first

1. **Read `SESSION.md`** (repo root, untracked). If it exists it is the record of
   everything that has already happened: decisions taken, questions the engineer has
   answered, what works, what is next. **Trust it over your assumptions.**
2. If it does not exist, create it from the template in **§16** before writing any code.
3. Read this brief and `reference/SCHEMA.md`.
4. Keep `SESSION.md` current as you work (§16). A session that ends without updating it
   has lost work, even if the code is committed.

---

## 1. Who this is for

The user is a **Network Repair Engineer on the Openreach contract** — copper and fibre
fault find and repair, exchange frame work, PCPs, DPs, footway boxes, poles up to 15m.
He works alone, outdoors and underground, in all weather, on a phone, often in gloves,
frequently with **no mobile signal at all**.

Every week he receives a job pack as a single-sheet Excel file — the current one holds
**442 jobs** for a single exchange. The real filename carries the exchange code and a
project number, so it is deliberately not recorded here (see `reference/README.md`).
Despite the job title, *this* pack is not fault repair: it is an **exchange equipment
migration**, moving 442 circuits off five old shelves onto one new one, via the MDF.
That is why the workflow has three gates rather than a single done/not-done.

Today he works it as a spreadsheet, or through a slow web tool that needs a live
connection and 22 seconds of sideways scrolling to reach the one button that matters.

The pack also contains **442 customer telephone numbers**. That makes this personal data,
and it is the reason the security section of this brief is not optional (§9.1).

He asked for exactly two things: **tick or fail a job**, and **sort ascending or
descending**. Everything else in this brief exists to make those two things fast in a
wet chamber at 4pm in November.

**Design test for every decision in this project:** can he do it one-handed, in gloves,
standing at the frame in an exchange basement with no signal, without looking away from
the jumper for more than a second? If not, it is wrong. The same test holds for the days
he is out in a chamber in the rain instead.

---

## 2. What you are building

**PairTrack** — a mobile-first, offline-first, installable web app (PWA) for working a
job pack. It is a single-user tool. It **stores several packs and works one at a time**,
so last week's pack stays available for queries while this week's is live. All job data
lives **only** on his phone, **encrypted at rest**, and never leaves the device unless
he explicitly exports it.

**Why the name:** `MDF BAR PAIR` is the one field that identifies a job physically,
drives the sort order and defines the walk order round the frame. The tool tracks pairs
through a workflow. It is also deliberately not tied to *migration* or *cutover*, because
next week's pack may be fault repair instead.

- Repo: `github.com/omarlatreche/pairtrack`
- Hosting: GitHub Pages (static), deployed by GitHub Actions
- Backend: **none**. There is no server, no API, no database, no account, no telemetry.

---

## 3. Non-negotiables

Violating any of these is a build failure, not a style disagreement.

1. **No job data ever enters the git repository.** Not as a fixture, not as a test
   sample, not in a comment. Enforced by a pre-commit hook *and* a CI check (§10).
   There is exactly one declared exception, covering four job numbers legible in the
   reference screenshots — see §9.8, and it needs the engineer's agreement.
2. **No network requests at runtime.** After install the app must function with the
   device in aeroplane mode, permanently. No CDNs, no Google Fonts, no analytics, no
   error reporting, no font/script/style loaded from another origin. Enforced by CSP
   and a build-time bundle check.
3. **All persisted job data is encrypted** with a key derived from a passphrase only
   the engineer knows (§9). Plaintext job data must never be written to IndexedDB,
   localStorage, sessionStorage, the cache storage, or a file — at any point, including
   transiently during import.
4. **Offline-first, not offline-tolerant.** Offline is the normal case. There is no
   "reconnecting" state, no sync spinner, no `Last sync` label.
5. **Every interaction is instant.** 442 rows is nothing. Nothing in this app is
   allowed to show a loading spinner except the initial xlsx parse.
6. **Nothing is ever lost.** Every state change is written through and undoable. A
   crashed tab, a dead battery or a force-quit must not cost a single tick.

---

## 4. Read the reference pack first

`reference/SCHEMA.md` is the **derived schema of the real job pack** — columns, types,
cardinality, patterns, the three job types, the two malformed rows and the import
gotchas. It contains no real cell values, so it is safe to commit. **Read it first.**

`reference/README.md` documents eight screenshots and seven video frames from the tool
he uses today: the column order, the three-state tick/fail control, and the auto-filled
timestamps. Read it before designing the UI.

It also lists what is wrong with the current tool. Those four failings are the reason
this project exists — do not reproduce them.

---

## 5. The data model

**The real spreadsheet has been analysed. Do not guess, and do not ask for it —
`reference/SCHEMA.md` is the authority.** Read it in full before writing the importer.

Headline facts:

- One sheet, one **Excel Table named `Job_pack`, range `A1:I443`** — read the table, not
  the used range (columns J–N are empty but formatted, so naive readers see 14 columns).
- **9 source columns, 442 job rows**: `JOB`, `Job Number`, `DB`, `Circuit`,
  `MDF BAR PAIR`, `ESIDE TIES`, `DSIDE TIES`, `New_Equipment`, `Old_Equipment`.
- **`Job Number` is the natural key** — 442 unique values, format `AAA###/#`.
- The pack is an **equipment migration**: every row moves one circuit off one of five old
  shelves onto a single new shelf. Hence the gates *Ready to activate → Test → Completed*.
- **Three job types**, derived not given: **217 no-ties**, **222 E/D-side ties**,
  **3 LLU ties**. Roughly half the pack is materially more work than the other half.
- **`MDF BAR PAIR` parses to `{frame, block, number}`** — 415 jobs on frame `01` across
  17 blocks, 26 on frame `09` block `INTL`. This is what makes frame-walk order possible.
- **Two malformed rows** exist in the real file. Both are listed in `SCHEMA.md` with the
  required behaviour. Handle them; never crash, never silently drop.
- **`New_Equipment` / `Old_Equipment` values carry a literal leading apostrophe.** Strip
  it on import.
- **`DB` is constant across the entire pack.** Detect constant columns generically and
  keep them off the card and out of the sort list.

### 5.1 Source vs progress

Columns A–I are **imported truth: read-only, never mutated**. The source file contains
**no** progress columns at all — `Ready to Activate`, `Test Status`, `Notes`,
`Completed By` and the timestamps exist only in the app. `VERT` and `UP`, visible in the
reference screenshots, are likewise engineer-entered, not in the sheet.

Keep the two in separate objects so re-importing next week's pack refreshes source data
without touching progress.

```ts
type JobType   = 'no-ties' | 'ed-side' | 'llu';
type JobStatus = 'outstanding' | 'activated' | 'failed' | 'tested' | 'completed';

interface BarPair {          // parsed from MDF BAR PAIR, null if unparseable
  frame: string;             // '01' | '09'
  block: string;             // 'A'…'W' | 'INTL'
  number: number;            // numeric, for correct ordering
  raw: string;
}

interface Job {
  id: string;                       // hash of jobNumber — the merge key on re-import
  source: Record<string, string>;   // columns A–I verbatim, in sheet order
  seq: number;                      // JOB column
  jobNumber: string;                // natural key
  barPair: BarPair | null;          // null → sorts into the 'Unplaced' group
  jobType: JobType;                 // derived from the tie columns on import
  defects: string[];                // e.g. ['bad-barpair'] — surfaced in the UI
  progress: {
    readyToActivate: null | 'yes' | 'failed';
    activatedAt: string | null;     // ISO 8601, written by the app, never typed
    testStatus: null | 'pass' | 'fail';
    testedAt: string | null;
    completedAt: string | null;
    completedBy: string | null;     // defaults to engineer name from settings
    failReason: string | null;      // reason code, see §7.6
    vert: string | null;            // engineer-entered, optional
    up: string | null;              // engineer-entered, optional
    notes: string;
    locked: boolean;
    updatedAt: string;
  };
}
```

Rules:
- **Timestamps are written by the app.** Setting `readyToActivate` writes `activatedAt`;
  clearing it clears the timestamp.
- Status is **derived** from the progress fields, never stored separately.
- Legal transitions: `outstanding → activated → tested → completed`, plus
  `outstanding → failed` at any gate. Everything is revertible with undo. Put the
  transition table in one module and unit-test it.
- Preserve all nine source columns untouched so export round-trips exactly.

### 5.2 Handling the real file safely

`Circuit` holds **442 real customer telephone numbers** (§9.1). When you need the file
for development, read it from a scratch directory **outside the repo**
(`/tmp/pairtrack-scratch/`) and delete it when done. Build all committed fixtures from
**synthetic** data — same shapes, same defects, fake values. `SCHEMA.md` gives you every
pattern you need to generate them, which is why it contains no real values.

## 6. Tech stack

Keep the dependency count low; every dependency is code he cannot audit.

| Concern | Choice |
|---|---|
| Build | **Vite** + **TypeScript**, `strict: true` |
| UI | **Preact** (or React — pick one, justify it in `docs/DECISIONS.md`) |
| Styling | Plain CSS with custom properties. **No Tailwind, no UI kit.** |
| Storage | **IndexedDB** via `idb` |
| Crypto | **WebCrypto only.** No crypto libraries. |
| Spreadsheet | **SheetJS (`xlsx`)**, bundled locally, never from a CDN |
| Tests | **Vitest** (unit) + **Playwright** (e2e, mobile viewport) |
| PWA | Hand-written service worker, or `vite-plugin-pwa` if it produces a readable SW |

No state management library. No date library — `Intl.DateTimeFormat` with `en-GB` is
enough. No icon package — inline SVG.

---

## 7. The application

### 7.1 Screens

1. **Lock** — passphrase entry. The first thing seen on every launch.
2. **First run** — create passphrase (with the "there is no recovery" warning, §9.6),
   set engineer name, import the first job pack.
3. **Job list** — the home screen. Cards, not a table (§7.3).
4. **Job detail** — full-screen, every field, all three gates, notes.
5. **Import** — file picker → column mapping → merge preview → confirm.
6. **Settings** — engineer name, auto-lock timeout, backup/restore, wipe, version.

### 7.2 Global chrome

- Header: pack name (as imported), a **progress ring** (`137 / 442`), and a session
  counter (`23 done today · 1h 42m`).
- **All primary controls live in the bottom third of the screen** — that is where a
  thumb reaches on a phone held one-handed.
- Dark by default. A **high-contrast "sunlight" mode** toggle for bright daylight —
  near-black on white, heavier weights, no thin strokes.
- A permanent, obvious **lock button**.

### 7.3 The job list — cards, not a table

This is the single biggest improvement over the current tool. A 15-column table on a
phone is unusable; the reference recording is 22 seconds of sideways scrolling.

Each card shows, in this priority order:

1. **Job number**, large, tabular figures, high contrast — the thing he matches against
   paperwork and against the frame.
2. **Frame position** — `frame / block + pair` as a compact chip row. This is what he
   navigates by.
3. **`Old_Equipment` → `New_Equipment`** — the actual move, present on every job.
   Show the tie references *only on the jobs that have them* (222 of 442); on the other
   217 that row would be empty noise.
4. **Job type badge** — `No ties` / `E/D-side` / `LLU`. It tells him how long the job
   will take before he walks to it.
5. **Status chip** — colour *and* text *and* icon. Never colour alone (glare, gloves,
   colour vision).
6. **Two thumb-sized action buttons: ✓ and ✗.** Minimum 56×56 CSS px, well separated
   so a gloved thumb cannot hit the wrong one.

Interactions:
- Tap ✓ / ✗ → advances the current gate, writes the timestamp, fires a short haptic
  (`navigator.vibrate`), shows an **undo toast for 6 seconds**.
- Tap the card body → job detail.
- Optional swipe right = pass, swipe left = fail. Must be *additional* to the buttons,
  never the only way, and must not fight vertical scrolling.
- **Auto-advance**: after marking, scroll the next job in the current sort order to the
  top. He should never hunt for his place.
- Virtualise the list above ~200 rows so scrolling stays at 60fps.

Show the full sortable table **only at ≥900px** for desktop review. Same data, same store.

### 7.4 Sorting — his explicit ask, so make it excellent

A sort control in the bottom sheet: pick a field, toggle **ascending / descending**,
with the current sort always visible as a chip on the list header. Persist across
launches.

Sortable: job number, sheet order, status, frame position, last updated, and any
imported column.

Two extras that matter more than plain A→Z:

- **Frame walk order** — sort by the parsed bar pair: **frame → block → numeric pair**,
  so the list follows the physical order he walks the frame instead of the order the
  office typed it. In this pack that is 415 jobs across 17 blocks on frame `01`, then 26
  on frame `09`. One-tap preset, and it should be the **default sort** unless he says
  otherwise. Jobs with an unparseable bar pair go into an `Unplaced` group at the end.
- **Group by block** — sticky section headers per `frame/block`, each with a done/total
  count. Block sizes run from 5 to 58 jobs, so the counts genuinely help him pace a day.
- **Group by old shelf** — the pack recovers from five old equipment shelves; if he works
  shelf by shelf this is the more useful grouping. Offer both (§14 Q5).

Sort must be natural/human: `ABC123/4` before `ABC456/7`, and `V2` before `V10`. Write a
natural-sort comparator and unit-test it against a mixed alphanumeric list.

### 7.5 Filtering and search

Filter chips with live counts, mirroring what he already knows:
`All (442) · Outstanding (442) · Activated (0) · Tested (0) · Completed (0) · Failed (0) · Locked (0)`

Plus a second row for the derived dimensions, because they change how long a job takes:
`No ties (217) · E/D-side (222) · LLU (3)`, and `Frame 01 (415) · Frame 09 (26)`.

Search: one box, matching partial **job number, circuit number, bar pair, tie refs,
equipment and notes**. Case- and separator-insensitive — `abc123`, `ABC 123` and `123/4`
must all find the same job, and a circuit number must match whether or not he types the
leading `0`. Searching by circuit number is how the office will identify a job to him
over the phone, so it has to work first time. Debounce 120ms, no more.

Filter + sort + search compose, and the combination is restored on relaunch.

### 7.6 Failing a job

A fail must be as fast as a pass, or he will not record it properly.

Tap ✗ → a bottom sheet of **one-tap canned reasons**, plus "Other" with free text.

**These must match migration work, not fault repair.** This pack moves circuits between
equipment shelves via the MDF, so the ways a job fails are things like the pair not being
where the paperwork says, the port being unusable, or the line testing bad after the move:

`Bar pair not as documented` · `Pair already in use` · `No jumper found on old
equipment` · `New equipment port faulty` · `Ties not present / not as documented` ·
`Wiring damaged` · `Tests faulty after move` · `No dial tone after move` ·
`Customer service in use — cannot interrupt` · `Access to frame blocked` ·
`Awaiting further info`

**This list is a starting point written by someone who has not done the job — get his
real wording before shipping** (§14 Q7) and let him edit the list in settings.
Store the reason code, not the label, so labels can change without migrating data.

### 7.7 Job detail

Everything from `source` in the original column order, read-only, clearly separated from
the editable progress block. Inline edit for notes and `completedBy`. All three gates as
large segmented controls. A per-job change history (what changed, when) at the bottom —
this is what saves him when the office queries a job three weeks later.

### 7.8 Import

- File picker → **parse entirely in the browser** (SheetJS). Say so on screen: *"This
  file is read on your phone. Nothing is uploaded."*
- Read the **`Job_pack` Excel Table** (`A1:I443`), not the used range — otherwise you
  pick up five empty formatted columns.
- Strip a leading `'` from every string cell; derive `jobType` from the tie columns;
  parse `MDF BAR PAIR` into `{frame, block, number}`; detect constant columns.
- **Malformed rows must import.** Flag them with a `defects` entry, show a "needs
  attention" badge, and let him correct the value in-app. Never drop a row, never crash.
  Both real defects are described in `reference/SCHEMA.md` — make them fixtures.
- Auto-detect columns by fuzzy header match, then show a **column-mapping screen** with
  every detected column and a dropdown to map it to a known role. Remember the mapping
  per pack name so next week is one tap.
- **Merge preview before commit**: *"442 jobs — 0 new, 442 matched, 0 removed. Progress
  on 137 jobs will be kept."* Never silently overwrite.
- Match on `jobNumber`. Keep progress for matched jobs. Flag jobs that vanished from
  the new pack rather than deleting them.
- Handle multiple packs; let him switch between them.

### 7.9 Getting data out

Not a "reporting feature" — this is the only way his work reaches the office, so it is
core plumbing:

- **Export xlsx/CSV in the same column order as the source file**, with progress
  columns filled in, so the office receives something they already recognise.
- **Encrypted backup** (`.ptbak`) — see §9.5.
- Both are generated in-browser and handed to the OS share sheet or a download. Nothing
  is transmitted anywhere.

### 7.10 Offline / PWA

- Web app manifest: standalone display, portrait-primary, maskable icons (192/512),
  theme colour, short name `PairTrack`.
- Service worker precaches the entire app shell on install. **Every subsequent load,
  forever, is served from cache.** Network is only consulted for a new app version.
- Explicit update flow: detect a waiting SW, show a non-blocking *"Update available"*
  bar, apply on tap. Never auto-reload mid-job.
- Test it properly: install, aeroplane mode, force quit, relaunch, work 20 jobs, quit,
  relaunch — everything must still be there.

### 7.11 Accessibility and field ergonomics

- Touch targets ≥44px, primary actions ≥56px.
- WCAG AA contrast in both themes; verify the sunlight theme at AAA where you can.
- Readable and usable at 200% text size.
- Full keyboard operation for the desktop table view.
- Respect `prefers-reduced-motion`.
- Never encode meaning in colour alone.

---

## 8. Hosting reality check — read this before configuring anything

The user's plan is "private repo → GitHub Pages". **That combination does not exist on
a free GitHub account**, and it would not give privacy even if it did:

- GitHub Pages from a **private** repository requires **GitHub Pro / Team / Enterprise**.
  On GitHub Free, Pages only publishes from **public** repositories.
- Even on Pro, the published site is **served publicly**. Access-controlled Pages is a
  GitHub **Enterprise Cloud** feature only.
- An unlisted or hard-to-guess URL is **not** access control.

This design resolves that properly rather than working around it: **the repository never
contains any job data**, so repository visibility is not the security boundary. The
security boundary is the encryption on the device (§9). The source code being readable
does not weaken it — that is how all real cryptography works.

Present these three options to the user and let him choose. Record the choice in
`docs/DECISIONS.md`:

| Option | Cost | What it gives |
|---|---|---|
| **A. Public repo + GitHub Pages** *(recommended)* | Free | Works today. Code is public; data never was in it. Security comes entirely from §9. |
| **B. Private repo + GitHub Pages** | GitHub Pro (~£4/mo) | Source code hidden. The site is still publicly served. No data-security gain. |
| **C. Private repo + Cloudflare Pages + Cloudflare Access** | Free | Adds a real login gate (email one-time code) in front of the whole site, on top of §9. Same repo, same build, ~15 min setup. Strongest option. |

Build so all three work: a static bundle, relative asset paths, and `base` configurable
via env (`/pairtrack/` for Pages, `/` for Cloudflare).

---

## 9. Security design — implement exactly

### 9.1 Threat model

Write it up in `docs/SECURITY.md`. Be honest about scope: nation-state attackers and a
compromised phone OS are **out of scope**; say so.

**What raises the stakes here:** the `Circuit` column is **442 real customer telephone
numbers**. This pack is not just job references — it is personal data about named
subscribers, tied to their exchange, their frame position and their equipment. Losing it
is a personal-data breach, not an inconvenience, and it very likely engages both GDPR and
the Openreach/Kelly Group contract terms.

That single fact justifies every control below. The realistic threats are:

1. **A lost or stolen phone** — encryption at rest with a passphrase the device does not
   store (§9.2–9.4).
2. **Someone picking up an unlocked phone on site** — aggressive auto-lock (§9.4).
3. **Job data accidentally committed to a repo** — hooks and CI (§9.8). With a public
   repo (§8 option A) this is the highest-likelihood failure mode in the whole project.
   Treat the guardrails as load-bearing, not hygiene.
4. **A careless export** — exported xlsx/CSV is **plaintext personal data**. Warn on
   every export, and make the encrypted `.ptbak` backup the default share format.

### 9.2 Key derivation

- **PBKDF2-HMAC-SHA-256**, **600,000 iterations** (current OWASP guidance for PBKDF2).
- **32-byte salt** from `crypto.getRandomValues`, generated once at setup, stored in
  the clear in IndexedDB (a salt is not a secret).
- Derive a 256-bit AES-GCM key with `crypto.subtle.deriveKey`, **`extractable: false`**.
- Store the KDF parameters alongside the salt so future iteration-count increases can
  migrate transparently.
- Run the derivation in a **Web Worker** so the UI does not jank; show a brief progress
  state — 600k iterations is deliberately slow.

### 9.3 Encryption

- **AES-GCM, 256-bit.** A **fresh 12-byte random IV for every single encryption** —
  never reuse an IV with the same key. Add a unit test that asserts uniqueness across
  many encryptions.
- Encrypt the **entire job store as one blob** on save (442 jobs is well under 1MB) —
  simpler to get right than per-record encryption, and it does not leak record count.
- Writes are debounced (~500ms) and **write-through**: never leave a state change only
  in memory.
- Keep the **last 5 encrypted snapshots** in IndexedDB as a rollback ring.

### 9.4 Key handling and locking

- The `CryptoKey` lives in a **module-scoped variable only**. It is never written to
  localStorage, sessionStorage, IndexedDB, a cookie, or the URL.
- **Auto-lock** after 15 minutes idle (configurable 1–60), and on `visibilitychange`
  to hidden for more than 5 minutes.
- On lock: drop the key reference, clear decrypted state from memory, re-render the
  lock screen. No plaintext survives in the DOM.
- A **verifier blob** (a known constant encrypted with the derived key) lets a wrong
  passphrase fail cleanly with *"Incorrect passphrase"* instead of producing garbage.
- Rate-limit unlock attempts with escalating delay after 5 failures. Do **not** wipe
  after N failures — losing a day's work to a fat-fingered unlock is the bigger risk.

### 9.5 Backup and restore

- `.ptbak` = JSON: `{ version, kdf: { name, iterations, hash }, salt, iv, ciphertext }`.
- Because it is encrypted with his passphrase, it is **safe to email, AirDrop or put in
  iCloud**. Say so in the UI — that is what makes him actually take backups.
- Restore requires the passphrase that encrypted the file.
- Prompt for a backup after every import and at the end of any session with >20 changes.

### 9.6 Passphrase policy

- Minimum 12 characters. A strength meter (implement a small local heuristic —
  length, character classes, obvious patterns; **do not add a dependency for this**).
- Setup must state plainly and unmissably: **"There is no password reset. If you forget
  this passphrase your job data cannot be recovered by anyone, including you. Write it
  down somewhere safe and take backups."** Require an explicit acknowledgement.
- Allow changing the passphrase (decrypt with old, re-derive, re-encrypt with new).
- A confirm-by-typing **wipe** in settings for handing the phone on or losing it.

### 9.7 Transport and supply chain

- Strict CSP as a `<meta http-equiv>` tag **and** in `_headers` / Actions config:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
  object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  ```
- Add `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.
- **A build-time check that fails the build if the output bundle contains any external
  origin** in a fetch/script/style/font reference.
- Pin dependencies with a committed lockfile. Enable Dependabot. Keep the direct
  dependency count in single figures and list them with a justification in
  `docs/SECURITY.md`.

### 9.8 Keeping data out of git

Both of these, not one:

- **`.gitignore`**: `*.xlsx`, `*.xls`, `*.xlsm`, `*.csv`, `*.ptbak`, `/data/`, `/jobs/`,
  `/packs/`, `/scratch/`, `*.local.*`, and **`/SESSION.md`** (§16).
- **`.githooks/pre-commit`** (installed via `git config core.hooksPath .githooks`, and
  wired up in a `postinstall`/setup script so it cannot be forgotten): reject the commit
  if any staged file matches those patterns, **or** if any staged content matches a job
  reference pattern such as `/\b[A-Z]{2,4}\d{3,4}\/\d\b/`.
- **CI job `no-data`**: the same scan across the whole tree on every push. It must fail
  the build, not warn.
- Document in `README.md` what to do if data is ever committed: the history must be
  rewritten (`git filter-repo`) and the repo treated as leaked, not just reverted.
- **One exception to declare up front:** `reference/` contains phone screenshots of the
  existing tool, and four real job numbers are legible in them. No telephone numbers,
  bar pairs, ties or equipment references appear anywhere in `reference/` — that was
  checked. If the repo is public (§8 option A) and the engineer would rather have zero
  real references in it at all, either blur those four values or keep `reference/` out
  of the repo and hand it to me locally. **Ask him.** Whitelist `reference/*.png` in the
  pre-commit hook once he has decided, so the hook stays strict everywhere else.

---

## 10. Repository, git and CI

### 10.1 Structure

```
pairtrack/
├── .github/workflows/{ci.yml,deploy.yml}
├── .githooks/pre-commit
├── docs/{SECURITY.md,DATA-MODEL.md,DECISIONS.md,FIELD-GUIDE.md}
├── public/{manifest.webmanifest,icons/}
├── reference/            # the screenshots + frames (safe: no job data)
├── src/
│   ├── crypto/           # kdf, cipher, lock state — no UI imports
│   ├── data/             # schema, repository, migrations, transitions
│   ├── import/           # xlsx parse, column mapping, merge
│   ├── export/           # xlsx/csv out, backup in/out
│   ├── ui/               # components + screens
│   └── state/
├── tests/{unit,e2e}
├── BRIEF.md
└── README.md
```

Keep `src/crypto/` free of UI imports so it can be reviewed and tested in isolation.

### 10.2 Git discipline

- `main` is the only long-lived branch. Work in short-lived `feat/*` branches.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- One logical change per commit, with a real message body explaining *why*.
- Initialise with a proper `.gitignore` **before the first commit** — never rely on
  removing something later.
- Tag `v1.0.0` when §11 passes in full.
- `README.md` must be good enough that the engineer's brother can clone, install and
  deploy it a year from now without asking anyone.

### 10.3 CI (`ci.yml`, on every push and PR)

`typecheck` → `lint` → `unit` → `build` → `e2e` → `no-data` scan → `bundle-external-origin`
check. All required.

### 10.4 Deploy (`deploy.yml`, on push to `main`)

Build and deploy to GitHub Pages via `actions/deploy-pages` with the proper
`pages: write` / `id-token: write` permissions. Set Vite `base` from an env var. Add a
`.nojekyll` file. Never deploy if CI failed.

---

## 11. Definition of done

Do not report the project complete until every line passes. Run it as a literal
checklist and paste the results.

**Core ask**
- [ ] A job can be ticked or failed in **one tap** from the list, with correct timestamp.
- [ ] Any field sorts ascending and descending; the choice survives a relaunch.
- [ ] `ABC123/4` sorts before `ABC456/7`; `V2` sorts before `V10`.
- [ ] Frame-walk order (frame → block → numeric pair) and grouping both work, and the
      unparseable bar pair lands in `Unplaced` rather than breaking the sort.
- [ ] All three job types are derived correctly: 217 / 222 / 3.
- [ ] Both malformed rows import, are flagged, and are correctable in-app.
- [ ] Leading apostrophes are stripped; circuit numbers keep their leading `0`.
- [ ] Filter chips show correct live counts and compose with search and sort.

**Offline**
- [ ] Installs to the iOS and Android home screen and opens standalone.
- [ ] With the device in aeroplane mode from a cold start: launches, unlocks, loads all
      442 jobs, records 20 status changes, survives a force quit, and still has them.
- [ ] DevTools Network tab shows **zero** external requests during a full session.

**Security**
- [ ] IndexedDB contains **no readable circuit/telephone number**, job number or note —
      inspect it manually in DevTools and paste the evidence. This is the check that
      matters most; the pack is personal data.
- [ ] Plaintext export warns that the file contains customer telephone numbers.
- [ ] Wrong passphrase gives a clean "Incorrect passphrase", not corrupted state.
- [ ] Auto-lock fires on idle and on backgrounding; the key is gone after lock.
- [ ] `git log -p | grep` finds no job data anywhere in history.
- [ ] The pre-commit hook actually blocks a test commit containing a fake job reference.
- [ ] CSP is present in the deployed response and blocks an injected external script.
- [ ] Backup exports, wipes, restores, and comes back byte-identical.

**Quality**
- [ ] Unit tests cover: KDF round-trip, IV uniqueness, wrong-key failure, natural sort,
      bar-pair parsing (including the bad row), job-type derivation, apostrophe
      stripping, constant-column detection, status transitions, xlsx table parse,
      merge-on-reimport keeping progress.
- [ ] Playwright covers the full flow on a 390×844 viewport: setup → import → mark →
      lock → unlock → persistence → export.
- [ ] Lighthouse PWA passes; performance ≥90 on mobile.
- [ ] No TypeScript `any` in `src/crypto/` or `src/data/`.
- [ ] Scrolling 442 rows stays smooth on a mid-range phone.

---

## 12. Out of scope for v1 — do not build these

Mention them in `docs/DECISIONS.md` as deferred, then leave them alone:

- Multi-engineer sync, shared job pools, real job locking, any backend or account.
- Photo or evidence capture.
- Copper test-result interpretation (insulation resistance, loop resistance,
  capacitance-to-distance). Interesting, but it is a safety-adjacent calculation and it
  needs the engineer's sign-off before it goes anywhere near a real job.
- Maps, routing, mileage.
- Push notifications, email, any integration with Kelly Group or Openreach systems.

Do not scope-creep. A finished v1 he uses on Monday beats a half-built v2.

---

## 13. Build order

Commit at the end of each phase. Show the user something runnable at the end of phases
2, 4 and 6.

1. **Scaffold + guardrails.** Vite/TS, `.gitignore` (including `SESSION.md`),
   `SESSION.md` from the §16 template, pre-commit hook, CI with the `no-data` scan, CSP,
   docs skeleton. *Guardrails before code, so data can never leak.*
2. **Crypto core.** KDF worker, cipher, verifier, lock/unlock, auto-lock, full unit
   tests. Nothing else until these pass.
3. **Storage.** IndexedDB repository over the encrypted blob, snapshot ring, migrations.
4. **Import.** SheetJS `Job_pack` table parse, apostrophe stripping, bar-pair parsing,
   job-type derivation, defect flagging, column mapping, merge preview,
   merge-keeps-progress. Fixtures are synthetic — never the real file.
5. **Job list.** Cards, tick/fail, undo, auto-advance, virtualisation.
6. **Sort / filter / search**, including frame-walk order and grouping.
7. **Job detail**, notes, canned fail reasons, per-job history.
8. **Export** (xlsx/CSV + encrypted backup/restore).
9. **PWA**: manifest, service worker, install, update flow, offline test.
10. **Polish**: sunlight mode, haptics, accessibility pass, Lighthouse.
11. **Deploy**: Pages workflow, README, `v1.0.0` tag, run §11 end to end.

**Update `SESSION.md` at the end of every phase**, before the commit. That is what makes
the next session — in a new chat, next week — pick up where this one stopped.

---

## 14. Ask before you start

The schema questions are answered — `reference/SCHEMA.md` covers them. What is left is
domain knowledge only the engineer has.

**Check `SESSION.md` first and only ask what is still unanswered there.** Re-asking a
question he has already answered in a previous chat is the main way this project will
waste his time. Record every answer in `SESSION.md` the moment you get it.

Ask whatever is left in one go, then build:

1. **`MDF BAR PAIR` is `frame/block+number` (e.g. frame `01`, block `U`, pair `9001`).
   Is sorting frame → block → number genuinely the order you'd walk the frame?**
   If verticals run in a different physical order, give me the real order and I will use
   it as the sort key instead of alphabetical.
2. **How do `VERT` and `UP` relate to the bar pair?** They are not in the sheet, so
   either you look them up on site (I will make them editable fields) or they are
   derivable from the bar pair (I will compute them). Which?
3. **Do the 26 `09/INTL` jobs get worked separately** from the 415 on frame `01`?
   If they are a different location or a different visit, I will separate them in the UI.
4. **Does the ties/no-ties split change your job?** 217 jobs have no E-side/D-side ties
   and 222 do. If tie jobs take materially longer, I will badge and let you filter by it
   so you can plan a day.
5. **Is `Old_Equipment` shelf a useful way to batch work?** There are 5 old shelves; if
   you recover from one shelf at a time, I will add "group by old shelf" alongside
   frame-walk order.
6. **What does `Test Status` record** — a straight pass/fail, or a measured value you
   need to keep?
7. **What genuinely counts as "failed"?** Give me your real reasons in your own words so
   the one-tap buttons match what you would actually write.
8. **Is `Locked` worth keeping** for a single engineer, or drop it?
9. **What does "VC" in the filename mean,** and does anything about the workflow depend
   on it?
10. **Hosting: option A, B or C from §8?**
11. **iPhone or Android, and roughly which model?**

## 15. How to work

- Follow the phases. Do not jump ahead to UI polish with the crypto half-built.
- After each phase: run the tests, run the `no-data` scan, **update `SESSION.md`**, commit.
- If something in this brief is wrong or would produce a worse tool, **say so and argue
  the alternative** rather than building something you think is bad.
- Prefer boring, readable code. This has to be maintainable by someone who is not you,
  a year from now, on a phone in a van.
- Comment the crypto module properly — every parameter choice needs a one-line reason.
- No placeholder screens, no `TODO` left in `main`, no dead code. Finished means finished.

---

## 16. `SESSION.md` — carrying context between chats

Work on this will span many sessions and many separate chats. A new chat starts with no
memory of the last one, and re-deriving context is slow and gets things wrong.
`SESSION.md` is the fix: **one untracked file at the repo root that any future session
reads first.**

### Rules

- **Location:** repo root, `SESSION.md`.
- **Untracked.** It is in `.gitignore`. It lives on his machine only. Never commit it,
  never force-add it. The trade-off is deliberate: it is working context, not project
  documentation, and it must not end up in a public repo.
  - Consequence to be aware of: a fresh `git clone` elsewhere will not have it. If he
    moves machines he needs to copy it across. Say so in `README.md`.
- **No job data. Ever.** No circuit numbers, no job numbers, no bar pairs, no equipment
  references, no file paths pointing at the real spreadsheet. Refer to jobs by
  description ("the row with the malformed bar pair"), never by value. It is untracked,
  not secret — it will get pasted into chats.
- **Durable decisions still go in `docs/DECISIONS.md`** and get committed. `SESSION.md`
  is the working log; `docs/` is the record. When something in `SESSION.md` becomes
  settled, promote it and note that you did.
- **Rewrite, don't only append.** `## Current state` and `## Open questions` are replaced
  each time so they are always true. `## Decisions`, `## Answers` and `## Log` are
  append-only. A file that only grows stops being read.
- Keep it under roughly 200 lines. Prune the log when it gets long — keep decisions and
  answers, summarise old entries into a line.

### When to update it

- At the end of every phase in §13, before committing.
- Whenever the engineer answers one of the §14 questions — **immediately**, these are the
  single most valuable thing in the file.
- Whenever a decision is made or reversed.
- Whenever something breaks in a non-obvious way and you work out why.
- Before ending a session for any reason.

Do **not** log routine file edits. If it would not help a stranger resume the work
tomorrow, leave it out.

### Template

Create it with exactly these sections:

```markdown
# PairTrack — session log

> Untracked working context. Read this before BRIEF.md.
> Contains NO job data — no circuit numbers, job numbers, bar pairs or equipment refs.

## Current state
_(rewritten every update — always describes right now)_

- **Phase:** 1 of 11 — scaffold + guardrails
- **Working:** nothing yet
- **Next:** crypto core (phase 2)
- **Blocked on:** §14 questions 1, 2, 6, 7, 10, 11 — not yet answered

## Answers from the engineer
_(append-only — the highest-value part of this file)_

| # | Question | Answer | Date |
|---|---|---|---|
| — | _none yet_ | | |

## Decisions
_(append-only. Promote settled ones into docs/DECISIONS.md and mark them promoted.)_

- **YYYY-MM-DD** — Decision. _Why._ (promoted → docs/DECISIONS.md)

## Open questions
_(rewritten every update)_

- Hosting option A / B / C not yet chosen (§8)

## Gotchas
_(append-only — things learned the hard way, so they are not re-learned)_

- Equipment cells contain a literal leading apostrophe in the value, not an Excel
  quote-prefix flag. Strip it on import.

## Log
_(newest first, one or two lines each)_

- **YYYY-MM-DD** — Repo scaffolded; guardrails in place; `no-data` CI check verified
  against a deliberately bad test commit.
```

### Definition of done for this

Add to §11:

- [ ] `SESSION.md` exists, is gitignored, and `git status` never shows it.
- [ ] It contains no job data — scan it with the same `no-data` check the CI uses.
- [ ] A cold read of `SESSION.md` alone tells you the phase, what works, what is next,
      and every answer the engineer has given. Test it honestly: could a session that
      had never seen this project resume from it?
