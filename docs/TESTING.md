# Trying it yourself

How to run PairTrack and check it does what it claims. Written for the engineer,
not for a developer — but the developer notes are at the bottom.

---

## First, one thing that will catch you out

**PairTrack will not run over plain `http://` on a phone.**

Browsers only allow encryption over `https://`, or from `localhost`. So:

- On a **laptop**, `http://localhost:5173` works fine — `localhost` counts as secure.
- On a **phone**, `http://192.168.1.x:5173` does **not**. The app will tell you so
  rather than crashing, but it will not run.

To try it on a real phone you need real https. Two ways, both below.

---

## Option A — on a laptop, in five minutes

This is the fastest way to see everything working.

```bash
npm install
```

```bash
npm run dev
```

Open the URL it prints (`http://localhost:5173`).

**Make the window phone-shaped first**, or you will get the desktop table instead of
the cards: open DevTools (F12 or ⌘⌥I), click the device-toolbar icon, pick iPhone 14
Pro. The card layout is the one that matters.

Then:

1. Enter a name and a passphrase (12+ characters), tick the acknowledgement, continue.
   The pause is the 600,000-iteration key derivation. It is meant to be slow.
2. **Import** → choose your real job pack spreadsheet.
   It is read on your machine. Nothing is uploaded — there is nowhere to upload it to.
3. Check the detected columns, **Continue**, read the merge summary, **Import**.

You should see: **442 jobs**, the filter chips reading `All 442 · Outstanding 442`,
`No ties` / `E/D-side` / `LLU` splitting roughly 217 / 222 / 3, `Frame 01` and
`Frame 09` splitting 415 / 26, and `Needs attention 2`.

> The pack file is `.gitignore`d and the pre-commit hook blocks it, so having it in the
> project folder cannot commit it. It is still simplest to keep it somewhere else.

## Option B — on your actual phone

You need https, which means putting it somewhere real. Either:

**Deploy it** (this is the point of the project anyway) — push to GitHub, enable Pages
under **Settings → Pages → Source → GitHub Actions**, and open the published URL on the
phone. See the README.

**Or tunnel it temporarily** — no account needed. **Two terminals, in this order.**

First:

```bash
npm run preview -- --port 4173
```

Leave that running. Then, in a second terminal:

```bash
npx cloudflared tunnel --url http://localhost:4173
```

It prints an `https://…trycloudflare.com` URL. Open that on the phone.

Start the tunnel *before* the server and it points at nothing — Cloudflare answers with a
502 and it looks like the app is broken. `vite.config.ts` already lists the tunnel
providers under `allowedHosts`; without that Vite rejects the tunnel's Host header with
*"Blocked request. This host is not allowed."*

Both terminals have to stay open. The tunnel dies when you close it, which is what you
want for a test — but note the URL is **different every time**. A phone that installed
from the old URL treats a new one as a separate app with its own empty vault, so for
testing across several days, deploy it properly and get a stable URL instead.

Once it loads: **iPhone** → Share → *Add to Home Screen*. **Android** → menu →
*Install app*. Then open it from the icon, not the browser.

---

## The things worth actually checking

Work through these in order. They are the claims the app makes about itself.

### 1. One tap does the job

Tap the green tick on the first card. It should immediately show **Activated** with a
timestamp, the chip counts should change, and an **Undo** bar should appear for six
seconds. Tap Undo — it should go straight back to Outstanding.

Tap the tick three times on the same job: *Activated → Tested → Completed*. The tick
then greys out. Timestamps write themselves; you never type one.

### 2. It follows the frame, not the spreadsheet

The list should already be in **Frame walk order** — `01/A…` then `01/B…`, and within a
block the pair numbers should climb *numerically* (`A9` before `A100`, not after it).

The very last job in the pack has a bad bar pair in the source file. It should be in an
**Unplaced** group at the end, flagged **Needs attention** — not dropped, not crashing.

### 3. Sorting, both ways

**Sort** → **Descending** → **Job number**. The order should reverse and the list should
jump back to the top. Close the app, reopen, unlock — the sort should still be there.

### 4. Search finds a job the way the office would

Type a **circuit number** into the search box. It should find that one job.

Then try it **without the leading zero**, and with spaces in the middle. All three should
find the same job — that is deliberate, because the office will read it to you over the
phone however they read it.

### 5. Failing is as fast as passing

Tap the red cross. You should get a sheet of one-tap reasons. Pick one — the job goes to
**Failed** and the reason shows on the card.

**Those reasons were written by someone who has not done your job.** Settings → Fail
reasons → change any of them to what you would actually write. Renaming one does not
disturb jobs already marked with it, so change them freely.

### 6. It really works with no signal

The important one.

1. Load the app, import the pack, then **turn on aeroplane mode**.
2. Force-quit it. Reopen from the home-screen icon.
3. It should launch, unlock, and show all 442 jobs.
4. Mark twenty jobs. Force-quit again. Reopen.
5. All twenty should still be there.

Nothing about that should feel different from being online, because nothing about it
*is* different.

### 7. Your data is not readable on the phone

If you want to see this for yourself on a laptop: DevTools → **Application** →
**IndexedDB** → `pairtrack`. Open the `vault` record. You should see nothing but random
bytes — no job number, no telephone number, no note. That is the whole point.

### 8. Locking

Leave it untouched for the auto-lock time (Settings, default 15 minutes), or just tap
the red padlock. It should return to the lock screen with nothing readable behind it.

Try a **wrong passphrase** — it should say *"Incorrect passphrase"* cleanly. Then the
right one, and everything should be exactly as you left it.

### 9. Getting it back to the office

**Export → Spreadsheet (.xlsx).** It warns you first, because that file is **not
encrypted and contains every customer's telephone number**. Open the result: your nine
original columns, in the original order, with your progress added on the end.

**Export → Encrypted backup (.ptbak).** Type the passphrase twice. That file is
ciphertext — safe to email to yourself. Test the round trip: Settings → *Restore from a
.ptbak file* → same passphrase. Everything should come back.

### 10. Next week's pack

Import the same file again. Before anything commits it should say **"442 jobs — 0 new,
442 matched, 0 removed"** and, if you have marked anything, **"Progress on N jobs will
be kept"**. Confirm — your ticks should survive.

---

## What to tell me if something is wrong

Most useful, in order:

1. What you tapped, and what happened instead of what you expected.
2. Whether the phone was in aeroplane mode.
3. The version from **Settings → About**.
4. If it is a data problem: *which column* looks wrong, not the values in it. **Do not
   paste job numbers or telephone numbers into a chat** — describe them instead
   ("the circuit column is empty on every row").

---

## For a developer

```bash
npm run verify
```

Runs the whole gate: typecheck, lint, 137 unit tests, production build, the check that
the bundle contains no external origin and no network API at all, the working-tree data
scan, and the git-history scan.

Individually:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright, 390×844, against the production build |
| `npm run test:e2e -- --headed` | Same, but watch it happen |
| `npm run check:data` | Scan the working tree for job-pack data |
| `npm run check:history` | Scan every commit ever made |

The e2e suite generates its own synthetic 442-row pack in a temp directory and deletes
it afterwards. **No real pack file is ever needed to run the tests, and none should ever
be added to the repo** — the fixtures reproduce every shape and both malformed rows from
the real file using fabricated values.

### If the toolchain hangs

Interrupting a node process here can leave `node_modules` in a state where `tsc`,
`vitest` and `vite` all hang at ~0% CPU with no output and no error. The cure:

```bash
rm -rf node_modules && npm ci && npm approve-scripts --allow-scripts-pending
```

Avoid `pkill`-ing build processes; let them finish.
