# PairTrack

An offline, encrypted job-pack tracker for Openreach frame work. It runs on a phone, in a
browser, with no signal, no account and no server.

You import the week's spreadsheet, work the pack a job at a time — tick or fail, one
thumb — and export a file the office recognises. **All job data lives only on the phone,
encrypted, and never leaves it unless you export it.**

---

## Why it exists

The week's pack is 442 jobs at one exchange. Worked today as a spreadsheet, or through a
web tool that needs a live connection and 22 seconds of sideways scrolling to reach the
one button that matters. Exchange basements, footway boxes and chambers do not have
signal.

The design test for every decision in this app: *can he do it one-handed, in gloves,
standing at the frame in a basement with no signal, without looking away from the jumper
for more than a second?*

That is why it looks the way it does:

| Decision | Reason |
|---|---|
| Cards on a phone, table only on a wide screen | Fifteen columns do not fit a 6" screen and never will. |
| Two 56px buttons per card | A gloved thumb cannot reliably hit a small target, or avoid the wrong one. |
| **Frame-walk order is the default sort** | The pack arrives in the order the office generated it. Sorting by the parsed bar pair — frame, then block, then pair number — makes the list follow the order the frame is physically walked. |
| Status shown as colour **and** text **and** icon | Glare, gloves and colour vision. Never colour alone. |
| Offline-first, not offline-tolerant | There is no "reconnecting" state, because offline is the normal case. |
| Everything encrypted at rest | The pack contains 442 customer telephone numbers. That is personal data. |

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open the URL it prints. On first run it asks for a name and a passphrase, then for the
spreadsheet.

> **There is no password reset.** If the passphrase is lost, the data is gone — there is
> no recovery path for anyone, including whoever wrote this. Write it down somewhere safe
> and take backups. See [docs/SECURITY.md](docs/SECURITY.md).

## Everyday commands

```bash
npm run verify
```

That runs the whole gate: typecheck, lint, unit tests, production build, the
external-origin check, the working-tree no-data scan and the git-history scan. Run it
before pushing.

Individually:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/`, generates the service worker, then fails if any external origin reached the bundle |
| `npm run preview` | Serve the production build (this is what e2e runs against) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, 390×844 phone viewport) |
| `npm run check:data` | Scan the working tree for job-pack data |
| `npm run check:history` | Scan every commit ever made for a leak |
| `npm run icons` | Regenerate the PWA icons |

## Installing it on a phone

1. Deploy it (below), or run `npm run preview -- --host` and open the LAN URL.
2. **iPhone:** open in Safari → Share → *Add to Home Screen*.
   **Android:** open in Chrome → menu → *Install app*.
3. Open it from the home-screen icon. It runs standalone, with no browser chrome.
4. Turn on aeroplane mode and open it again. Everything still works — that is the point.

---

## Deploying

The build is a static bundle with relative asset paths, so it deploys anywhere. `base` is
env-driven:

### GitHub Pages — free, and what the workflow is already set up for

Six steps. You only do this once.

**1.** Create a **public** repository on GitHub called `pairtrack`. Do not add a README,
a .gitignore or a licence — this project already has them.

> It has to be public: GitHub Pages only publishes from a private repo on a paid plan.
> That is fine here and it is the whole point of the design — *the repository never
> contains any job data*, so repository visibility is not what protects it. The
> encryption on the phone is. Source code being readable does not weaken that; that is
> how all real cryptography works.

**2.** Point this folder at it, using your own username:

```bash
git remote add origin https://github.com/YOUR-USERNAME/pairtrack.git
```

**3.** Send the code up:

```bash
git push -u origin main && git push origin v1.0.0
```

**4.** On GitHub, go to **Settings → Pages**, and under *Source* choose
**GitHub Actions**. Do this before the next step or the deploy fails.

**5.** Go to the **Actions** tab. A run called *Deploy to GitHub Pages* should be going.
It runs the tests first and only deploys if they pass, so give it a few minutes.

**6.** When it is green, the app is at:

```
https://YOUR-USERNAME.github.io/pairtrack/
```

Open that on the phone and add it to the home screen. Every later `git push` to `main`
redeploys it automatically.

### Cloudflare Pages + Cloudflare Access — also free, adds a login gate

Worth it if you want a second lock in front of the whole site on top of the encryption.
About 15 minutes. Point Cloudflare Pages at the same repo with build command
`npm run build`, output directory `dist`, and environment variable `PAIRTRACK_BASE=/`.
Then add an Access policy for the one email address that should reach it.

The `_headers` file the build writes is picked up automatically, which also gets you
`frame-ancestors` — see [docs/SECURITY.md](docs/SECURITY.md) §7.

See [docs/DECISIONS.md](docs/DECISIONS.md) D10 for the full comparison.

---

## How the data works

The source spreadsheet has **nine columns and 442 rows**, as a named Excel table. The app
reads that table, not the used range — five columns after it are empty but formatted, so
a naive reader reports fourteen columns.

**Columns A–I are imported truth and are never modified.** Progress (`Ready to activate`,
`Test status`, `Completed`, notes, `VERT`, `UP`) exists only in the app; the spreadsheet
has no such columns. Keeping the two apart is what lets you re-import next week's pack and
keep every tick you have already made.

Re-import matches on job number, shows you exactly what will happen before it commits, and
**flags jobs that vanished from the new pack rather than deleting them**.

Full detail: [docs/DATA-MODEL.md](docs/DATA-MODEL.md) and
[reference/SCHEMA.md](reference/SCHEMA.md).

---

## Getting work back to the office

- **Encrypted backup (`.ptbak`)** — safe to email, AirDrop or leave in iCloud, because it
  is ciphertext. This is the default share format and the only thing that gets your work
  back if the phone is lost.
- **Spreadsheet or CSV** — the nine source columns, verbatim and in the source order, with
  the progress columns appended. **This file is plaintext and contains 442 customer
  telephone numbers.** The app warns before producing one. Send it only to the office, by
  whatever route your contract allows, and delete it from the phone afterwards.

---

## Job data never goes in this repository

The pack is personal data. Three independent guards, all of which must pass:

1. `.gitignore` covers every spreadsheet and backup extension.
2. `.githooks/pre-commit` refuses a commit containing one, or containing content that
   matches a job-reference pattern. It is installed automatically by `npm install`, so a
   fresh clone cannot forget it.
3. A **required** CI job runs the same scanner over the whole tree on every push, plus a
   second scanner (`scripts/scan-history.mjs`) over the full git history. The history one
   deliberately checks less: a raw diff line carries no file context, so it looks only for
   the two unambiguous signs of a leak — a spreadsheet or backup file committed at any
   point, and a customer telephone number in any commit. Both were verified against a
   repository where a `.csv` was committed and then deleted; the working tree looked clean
   and the scan still failed, which is the whole point.

The hook and CI share one scanner (`scripts/no-data-scan.mjs`) so they cannot drift apart.

If a file legitimately needs to contain reference-*shaped* strings — the synthetic test
fixtures do — put the line `no-data-scan: synthetic` in its first 40 lines. That is a
deliberate, greppable declaration that every value in the file is fabricated. It never
waives the telephone-number check.

### If job data is ever committed

Do **not** just delete the file and commit again. The blob stays in history and, on a
public repository, may already be indexed.

1. Rewrite history with [`git filter-repo`](https://github.com/newren/git-filter-repo) to
   remove the blob entirely, then force-push.
2. Treat the repository as **leaked**, not merely fixed.
3. Because it is personal data, report it — to Kelly Group and up the chain to Openreach.
   That is a contractual and probably a GDPR obligation, not a judgement call.

---

## Working on it

```
src/
  crypto/    kdf, cipher, lock state, passphrase policy — no UI imports, testable alone
  data/      schema, transitions, sorting, the repository over the encrypted blob
  import/    xlsx parse, column mapping, merge
  export/    xlsx/csv out, encrypted backup in and out
  state/     the store and the actions the UI calls
  ui/        components and screens
tests/
  unit/      Vitest. Fixtures are synthetic — never the real file.
  e2e/       Playwright, phone viewport, against the production build.
docs/        SECURITY, DATA-MODEL, DECISIONS, FIELD-GUIDE
scripts/     guardrails, icon generation, service-worker generation
```

- `src/crypto/` imports nothing from `src/ui/`, so it can be reviewed on its own. Every
  parameter in it has a one-line reason next to it.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), one logical change
  per commit, with a body explaining *why*.
- Prefer boring, readable code. This has to be maintainable by someone who is not its
  author, a year from now, on a phone in a van.

### Direct dependencies

Three, and each has to justify itself:

| Package | Why |
|---|---|
| `preact` | The UI runtime, ~4KB. |
| `idb` | A thin, readable Promise wrapper over IndexedDB, ~1KB. It only ever sees ciphertext. |
| `xlsx` (SheetJS) | Reads and writes the spreadsheet. Bundled locally, never from a CDN, and dynamically imported so it is absent from the main chunk. |

No state library, no CSS framework, no date library, no icon package, no crypto library.
Every one of those would be code that cannot be audited by whoever inherits this.

### A note on `SESSION.md`

If you see references to `SESSION.md`, that is untracked working context that lives only
on the original machine — it is in `.gitignore` deliberately, so it can never reach a
public repository. **A fresh clone will not have it.** If you move machines, copy it
across by hand.

---

## Licence

MIT. See [LICENSE](LICENSE).
