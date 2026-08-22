# PairTrack — security design and threat model

The job pack contains **442 real customer telephone numbers**, each tied to a named
subscriber, their exchange, their frame position and their equipment. This is personal
data. Losing it is a personal-data breach that very likely engages both GDPR and the
Openreach / Kelly Group contract terms — not an inconvenience.

Every control below exists because of that fact.

---

## 1. Threat model

### In scope

| # | Threat | Control |
|---|---|---|
| 1 | **Lost or stolen phone** | Everything is encrypted at rest with a key derived from a passphrase the device never stores (§2, §3). A thief gets ciphertext. |
| 2 | **Someone picks up an unlocked phone on site** | Auto-lock on idle and on backgrounding (§4). |
| 3 | **Job data accidentally committed to the repo** | `.gitignore`, a pre-commit hook and a required CI job, all sharing one scanner (§6). With a public repo this is the highest-likelihood failure in the project. |
| 4 | **A careless export** | Plaintext xlsx/CSV export warns explicitly that the file contains customer telephone numbers. The encrypted `.ptbak` is the default share format (§5). |
| 5 | **Malicious script injection** | Strict CSP, no external origins, no `eval`, no inline script. A build-time check fails the build if any external origin reaches the bundle. |
| 6 | **Data leaving the device unnoticed** | There is no network code. No fetch, no XHR, no WebSocket, no beacon, no analytics, no error reporting. The CSP `connect-src 'self'` blocks it at the browser level as a second line. |

### Explicitly out of scope

Saying so plainly is part of an honest threat model:

- **A compromised phone OS.** Malware with root, a hostile keyboard, or a jailbroken
  device can read the passphrase as it is typed. Nothing a web app does survives that.
- **A nation-state adversary.** Not because the data does not matter, but because
  600,000 PBKDF2 iterations and AES-256 are not what stops one — legal process and
  physical access do.
- **Screen capture, shoulder surfing, and someone reading the phone over his shoulder
  at the frame.** Operational, not technical.
- **Browser zero-days.** The app runs in the browser's sandbox and inherits its fate.
- **Rubber-hose attacks.** There is no plausible-deniability mode and no duress
  passphrase. Pretending otherwise would be worse than not having one.

---

## 2. Key derivation

| Parameter | Value | Why |
|---|---|---|
| Algorithm | PBKDF2-HMAC-SHA-256 | Present in WebCrypto everywhere, no dependency. Argon2/scrypt would be stronger but would mean shipping and auditing a crypto library — a worse trade for a one-user app. |
| Iterations | **600,000** | Current OWASP guidance for PBKDF2-HMAC-SHA-256. ~0.5s on a mid-range phone. |
| Salt | **32 bytes** from `crypto.getRandomValues`, generated once at setup | Defeats precomputation. A salt is not a secret and is stored in the clear. |
| Output | AES-GCM 256-bit, `extractable: false` | Non-extractable means no code — ours or injected — can read the key material back out. |
| Where it runs | A dedicated Web Worker | 600k iterations blocks its thread for half a second; keeping it off the main thread keeps unlock responsive. |

KDF parameters are stored alongside the salt (`{ version, name, hash, iterations }`) so a
future increase in the iteration count can migrate existing vaults transparently instead
of locking the engineer out.

**The passphrase is never stored anywhere.** There is no reset. This is stated
unmissably at setup and requires an explicit acknowledgement.

## 3. Encryption

| Parameter | Value | Why |
|---|---|---|
| Cipher | AES-GCM, 256-bit | Authenticated: tampering fails loudly rather than decrypting to garbage. |
| IV | **12 bytes, fresh random per encryption** | 96 bits is the size GCM is specified for. IV reuse under one key is the single catastrophic GCM mistake — `cipher.ts` generates the IV internally and has no parameter for accepting one. A unit test asserts uniqueness across 2,000 encryptions. |
| Granularity | The whole job store as **one blob** | 442 jobs is well under 1MB. Per-record encryption would multiply the IV-handling surface and would leak the record count. |
| Write policy | Debounced ~500ms, write-through | A state change is never left only in memory. |
| Rollback | The last **5** encrypted snapshots kept in IndexedDB | Cheap insurance against a bad merge or a corrupted write. |

Everything persisted is ciphertext. IndexedDB holds, in the clear, only: the salt, the
KDF parameters, the sealed verifier blob, and non-sensitive UI settings (theme, sort
preference, engineer name). No job number, circuit number, bar pair, tie reference,
equipment reference or note is ever written in plaintext to IndexedDB, localStorage,
sessionStorage, the cache storage, or a file — including transiently during import.

## 4. Key handling and locking

- The `CryptoKey` lives in **one module-scoped variable** in `src/crypto/vault.ts` and
  nowhere else. It is never written to localStorage, sessionStorage, IndexedDB, a cookie
  or the URL.
- **Auto-lock** after 15 minutes idle (configurable 1–60), and after 5 minutes hidden.
  Backgrounding deliberately does *not* lock instantly: he switches to the camera or a
  text mid-job, and re-entering a 12-character passphrase in gloves every time would make
  him stop using the app — which is a worse security outcome than the 5-minute window.
- On lock the key reference is dropped, the KDF worker is terminated, and decrypted
  state is cleared from memory and from the DOM.
- A **verifier blob** — a known constant sealed with the derived key — turns a wrong
  passphrase into a clean *"Incorrect passphrase"* rather than a corrupt-looking store.
- Unlock attempts are rate-limited with an **escalating delay after 5 failures**,
  capped at 60s. There is deliberately **no wipe-after-N-failures**: losing a day's work
  to a fat-fingered unlock in the rain is a bigger real risk than the marginal gain
  against someone who already has the phone.

## 5. Backup, restore and export

`.ptbak` is JSON: `{ version, kdf: { name, iterations, hash }, salt, iv, ciphertext }`.

Because it is encrypted with his passphrase, **a `.ptbak` file is safe to email, AirDrop
or leave in iCloud.** The UI says so, because that is what makes backups actually happen.
Restore requires the passphrase that encrypted the file.

**Plaintext xlsx/CSV export is different and is treated differently.** It contains 442
customer telephone numbers in the clear. Every plaintext export shows an explicit warning
naming that fact before the file is produced, and `.ptbak` is the default share format.

## 6. Keeping job data out of git

Three independent layers, because one is not enough:

1. **`.gitignore`** — `*.xlsx`, `*.xls`, `*.xlsm`, `*.xlsb`, `*.csv`, `*.ptbak`,
   `/data/`, `/jobs/`, `/packs/`, `/scratch/`, `*.local.*`, and `/SESSION.md`.
2. **`.githooks/pre-commit`** — installed via `git config core.hooksPath .githooks` from
   `postinstall`, so it cannot be forgotten on a fresh clone. Rejects the commit on a
   forbidden file type or on staged content matching a job-reference pattern.
3. **CI job `no-data`** — required, runs the same scanner across the whole tree *and*
   greps the full git history. It fails the build; it does not warn.

The hook and CI call the same `scripts/no-data-scan.mjs`, so the two can never drift.

**Declared exception (BRIEF §9.8):** `reference/*.png` are phone screenshots of the
existing tool, and four real job numbers are legible in them. No telephone numbers, bar
pairs, tie references or equipment references appear anywhere in `reference/` — that was
checked. These files are exempt from content scanning. If the repo is public and zero
real references is preferred, blur those four values or keep `reference/` out of the repo.

**If job data is ever committed:** do not simply delete the file and commit again. The
blob stays in history and, on a public repo, may already be indexed. Rewrite history with
`git filter-repo`, force-push, and treat the repository as leaked — which means reporting
it, because it is personal data.

## 7. Transport and supply chain

Content-Security-Policy, applied both as a `<meta http-equiv>` tag (so it holds even on a
host that strips headers) and in `_headers` / the Actions config:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

`style-src 'unsafe-inline'` is the one relaxation. It is needed for inline style
attributes used by list virtualisation. It does not permit inline *script*, which is what
matters for XSS.

**`frame-ancestors` is a header-only directive.** Browsers ignore it inside a `<meta>`
tag, so it appears in `_headers` (Cloudflare Pages) but not in `index.html`. Consequence,
stated plainly: **on GitHub Pages, which cannot set response headers, the app can be
framed by another site.** That matters far less here than it would for a normal web app —
there is no session cookie to ride, no server endpoint to CSRF, and every action needs a
passphrase-derived key that lives only in memory — but it is a real difference between
option A and option C in BRIEF §8, and it is one more reason option C is the stronger
choice.

Also set: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

`npm run build` runs `scripts/check-no-external-origins.mjs` over `dist/` and **fails the
build** if any external origin appears in a script, style, font or fetch reference.

### Direct dependencies, and why each is here

| Package | Why | Risk if it went bad |
|---|---|---|
| `preact` | The UI runtime. ~4KB. | Full app compromise — but it never sees the key, and CSP blocks exfiltration. |
| `idb` | A thin, readable Promise wrapper over IndexedDB. ~1KB. | Only ever handed ciphertext. |
| `xlsx` (SheetJS) | Reads the `Job_pack` Excel table and writes the export. Bundled locally, never from a CDN. | Sees plaintext job data during import. It is the highest-value dependency in the project — hence pinned, lockfile-committed and dynamically imported so it is absent from the main chunk. |

Everything else is a devDependency and never reaches the device. The lockfile is
committed; Dependabot is enabled.

## 8. What an attacker with the phone actually gets

Honest summary:

- **Phone locked, app locked:** ciphertext and a salt. Attacking it means guessing the
  passphrase at 600,000 PBKDF2 iterations per attempt.
- **Phone unlocked, app locked:** the same. The key is not on disk.
- **Phone unlocked, app unlocked, in hand:** everything. This is exactly why auto-lock
  is aggressive and why the lock button is permanent and obvious.
- **A `.ptbak` file intercepted in email:** ciphertext. Same problem as the first case.
- **A `.xlsx` export intercepted in email:** everything, in the clear. This is why the
  export warns.
