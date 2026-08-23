/**
 * End-to-end, on a 390x844 viewport — BRIEF §11.
 *
 * Covers the whole flow the brief asks for: setup, import, mark, sort, search,
 * lock, unlock, persistence, export. Plus the checks that are only meaningful
 * in a real browser: that IndexedDB holds no readable job data, and that the
 * app does not touch the network.
 *
 * The fixture pack is generated into a temp directory outside the repo and
 * deleted afterwards, so no spreadsheet ever exists here (BRIEF §5.2, §9.8).
 *
 * All references in this file are fabricated.
 * no-data-scan: synthetic
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSyntheticPack } from './fixtures/makePack';

const PASSPHRASE = 'purple frame ladder Tuesday';
const ENGINEER = 'Test Engineer';
const TOTAL_JOBS = 442;

let scratchDir: string;
let packPath: string;

test.beforeAll(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'pairtrack-e2e-'));
  packPath = join(scratchDir, 'TEST-PACK 100000 VC.xlsx');
  writeSyntheticPack(packPath, { rows: TOTAL_JOBS });
});

test.afterAll(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

// Deriving a key is 600,000 PBKDF2 iterations — slow on purpose.
test.setTimeout(120_000);

async function firstRun(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up PairTrack' })).toBeVisible();

  await page.getByLabel('Your name').fill(ENGINEER);
  await page.getByLabel('Create a passphrase').fill(PASSPHRASE);
  await page.getByLabel('Type it again').fill(PASSPHRASE);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create and continue' }).click();

  await expect(page.getByText('No job pack yet')).toBeVisible({ timeout: 60_000 });
}

async function importPack(page: Page) {
  await page.getByRole('button', { name: 'Import a job pack' }).click();
  await page.setInputFiles('input[type="file"]', packPath);

  await expect(page.getByText('Check the columns')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Before anything changes')).toBeVisible();
  await page.getByRole('button', { name: `Import ${TOTAL_JOBS} jobs` }).click();
  await page.getByRole('button', { name: 'Go to the jobs' }).click();

  await expect(page.locator('.card').first()).toBeVisible();
}

async function unlock(page: Page) {
  await page.getByLabel('Passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial' });

test('setup, import, mark, lock, unlock, persistence, export', async ({ page }) => {
  // BRIEF §11: "DevTools Network tab shows zero external requests during a
  // full session." Compared against a fixed origin, not page.url(), which is
  // still about:blank while the very first navigation is in flight.
  const appOrigin = new URL(test.info().project.use.baseURL ?? 'http://localhost:4173').origin;
  const externalRequests: string[] = [];

  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) externalRequests.push(request.url());
  });

  // --- Setup ---------------------------------------------------------------
  await firstRun(page);

  // --- Import --------------------------------------------------------------
  await importPack(page);

  // The five empty-but-formatted columns must not appear as fields.
  await expect(page.getByRole('button', { name: /^All/ })).toContainText(String(TOTAL_JOBS));

  // Three job types, derived. LLU is exactly three rows in the fixture.
  await expect(page.getByRole('button', { name: /^LLU/ })).toContainText('3');

  // The bare-0 bar pair lands in Unplaced rather than breaking the sort.
  await expect(page.getByRole('button', { name: /^Unplaced/ })).toContainText('1');

  // Both malformed rows import and are flagged.
  await expect(page.getByRole('button', { name: /Needs attention/ }).first()).toContainText('2');

  // --- Frame-walk order is the default -------------------------------------
  await expect(page.locator('.sortbar__chip')).toContainText('Frame walk order');

  const positions = await page.locator('.tag--position').allTextContents();
  expect(positions.length).toBeGreaterThan(2);
  // Ascending within a block, numerically: A9 before A100.
  const numbers = positions
    .slice(0, 4)
    .map((text) => Number(text.replace(/^\d+\/[A-Z]+/, '')))
    .filter((n) => Number.isFinite(n));
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

  // --- One tap marks a job -------------------------------------------------
  //
  // The card IS the control now (D17): there is no separate tick button and
  // nothing to open. Tapping the card marks it done.
  const firstJobRef = (await page.locator('.card__ref').first().textContent())?.trim() ?? '';
  expect(firstJobRef).not.toBe('');

  await page.locator('.card').first().click();

  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Done/ })).toContainText('1');
  await expect(page.getByRole('button', { name: /^Not done/ })).toContainText(
    String(TOTAL_JOBS - 1),
  );

  // The timestamp is written by the app, not typed.
  await expect(page.locator('.card--pending').first()).toBeVisible();

  // --- Undo restores it ----------------------------------------------------
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /^Not done/ })).toContainText(String(TOTAL_JOBS));

  // --- Mark 20 jobs, as the brief's offline check requires ------------------
  //
  // Filtered to Not done first, which is how he would actually work: each job
  // he ticks leaves the filter and the next one moves up under his thumb.
  // Tapping the same card twice would just un-tick it.
  await page.getByRole('button', { name: /^Not done/ }).click();

  for (let i = 0; i < 20; i += 1) {
    await page.locator('.card').first().click();
    await expect(page.getByRole('button', { name: /^Not done/ })).toContainText(
      String(TOTAL_JOBS - 1 - i),
    );
  }

  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('button', { name: /^Done/ })).toContainText('20');

  // --- The pending pile signs off as one batch -----------------------------
  await expect(page.locator('.signoff')).toBeVisible();
  await page.getByRole('button', { name: /^Sign off all/ }).click();
  await expect(page.getByRole('button', { name: /^Signed off/ })).toContainText('20');
  await expect(page.locator('.signoff')).toHaveCount(0);

  // --- Search --------------------------------------------------------------
  const search = page.getByLabel('Search jobs');
  await search.fill(firstJobRef.replace('/', ' ').toLowerCase());
  await expect(page.locator('.card')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('.card__ref').first()).toHaveText(firstJobRef);
  await search.fill('');
  // Wait for the list to actually come back, not merely for a card to exist.
  // Search is debounced 120ms, so "a card is visible" is still true while the
  // single filtered result is on screen — and the sort assertions below then
  // run against a list of one.
  await expect(page.getByRole('button', { name: /^All/ })).toContainText(String(TOTAL_JOBS));
  await expect
    .poll(async () => page.locator('.card').count(), { timeout: 5000 })
    .toBeGreaterThan(1);

  // --- Sort survives a change and a relaunch -------------------------------
  await page.getByRole('button', { name: 'Sort', exact: true }).first().click();
  await page.getByRole('button', { name: 'Descending' }).click();
  await page.getByRole('button', { name: 'Job number' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.sortbar__chip')).toContainText('Job number');

  // Deliberately NOT "remember the top card and compare it later": the list is
  // virtualised, so `.first()` is whichever card is rendered, which depends on
  // scroll position. Assert the property that actually matters instead — that
  // what is on screen is in descending job-number order.
  const isDescending = async (locator: typeof page) => {
    const numbers = (await locator.locator('.card__ref').allTextContents()).slice(0, 8);
    expect(numbers.length).toBeGreaterThan(1);
    const sorted = [...numbers].sort((a, b) =>
      b.localeCompare(a, 'en-GB', { numeric: true, sensitivity: 'base' }),
    );
    expect(numbers).toEqual(sorted);
  };

  await isDescending(page);

  // --- Lock: the key and the data must leave memory ------------------------
  await page.getByRole('button', { name: 'Lock PairTrack' }).click();
  await expect(page.getByRole('heading', { name: 'PairTrack' })).toBeVisible();
  await expect(page.getByLabel('Passphrase')).toBeVisible();

  // No job data survives in the DOM after locking.
  const bodyAfterLock = (await page.locator('body').innerText()).toUpperCase();
  expect(bodyAfterLock).not.toContain(firstJobRef.toUpperCase());

  // --- Wrong passphrase fails cleanly --------------------------------------
  await page.getByLabel('Passphrase').fill('definitely not the passphrase');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect passphrase', { timeout: 60_000 });
  await expect(page.getByLabel('Passphrase')).toBeVisible();

  // --- Unlock and check everything survived --------------------------------
  await unlock(page);

  await expect(page.getByRole('button', { name: /^Signed off/ })).toContainText('20');
  // Sort choice persisted across the lock/unlock cycle — the field, the
  // direction, and the order actually applied to the list.
  await expect(page.locator('.sortbar__chip')).toContainText('Job number');
  await expect(page.locator('.sortbar__chip')).toContainText('↓');
  await isDescending(page);

  // --- Full reload: same result from cold ----------------------------------
  await page.reload();
  await unlock(page);
  await expect(page.getByRole('button', { name: /^Signed off/ })).toContainText('20');

  // --- Export offers the encrypted backup first ----------------------------
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByText('Encrypted backup (.ptbak)')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Spreadsheet \(\.xlsx\)/ }).click();
  // Plaintext export must warn before it produces anything.
  await expect(page.getByText(/customer telephone numbers/)).toBeVisible();
  await page.getByRole('button', { name: /I understand/ }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  // --- No external requests, for the whole session -------------------------
  expect(externalRequests).toEqual([]);
});

test('IndexedDB holds no readable job data', async ({ page }) => {
  await firstRun(page);
  await importPack(page);

  const firstJobRef = (await page.locator('.card__ref').first().textContent())?.trim() ?? '';

  // Notes are gone (D17), so the free-text canary rides on the one field left
  // that the engineer supplies: his own name, written onto every job he ticks.
  await page.locator('.card').first().click();
  await expect(page.locator('.card--pending').first()).toBeVisible();

  // Let the 500ms debounce fire.
  await page.waitForTimeout(1200);

  const dump = await page.evaluate(async () => {
    const open = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const db = await open('pairtrack');
    const chunks: string[] = [];

    for (const storeName of Array.from(db.objectStoreNames)) {
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });

      for (const value of values) {
        for (const inner of Object.values(value as Record<string, unknown>)) {
          if (inner instanceof ArrayBuffer) {
            let text = '';
            for (const byte of new Uint8Array(inner)) text += String.fromCharCode(byte);
            chunks.push(text);
          } else {
            chunks.push(JSON.stringify(inner));
          }
        }
      }
    }

    db.close();
    return chunks.join('\n');
  });

  // The dump must be substantial, or the assertions below pass vacuously.
  expect(dump.length).toBeGreaterThan(10_000);

  for (const needle of [
    firstJobRef,
    'QQA',
    '02079460',
    ENGINEER,
    PASSPHRASE,
  ]) {
    expect(dump).not.toContain(needle);
  }

  // What IS in the clear is only what should be.
  expect(dump).toContain('PBKDF2');
});

test('re-importing the same pack keeps progress', async ({ page }) => {
  await firstRun(page);
  await importPack(page);

  await page.locator('.card').first().click();
  await expect(page.getByRole('button', { name: /^Done/ })).toContainText('1');
  await page.waitForTimeout(1200);

  // Import the identical pack again.
  await page.getByRole('button', { name: 'Import' }).click();
  await page.setInputFiles('input[type="file"]', packPath);
  await expect(page.getByText('Check the columns')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // The preview must say so before anything is committed.
  await expect(page.getByText(/0 new/)).toBeVisible();
  await expect(page.getByText(/Progress on 1 job will be kept/)).toBeVisible();

  await page.getByRole('button', { name: `Import ${TOTAL_JOBS} jobs` }).click();
  await page.getByRole('button', { name: 'Go to the jobs' }).click();

  await expect(page.getByRole('button', { name: /^Done/ })).toContainText('1');
  await expect(page.getByRole('button', { name: /^All/ })).toContainText(String(TOTAL_JOBS));
});

test('a malformed row is flagged and correctable in the app', async ({ page }) => {
  await firstRun(page);
  await importPack(page);

  await page.getByRole('button', { name: /Needs attention/ }).first().click();
  await expect(page.locator('.card')).toHaveCount(2);

  // The correction lives in Settings, not on the card: he asked not to have to
  // click into jobs at all, and this is a one-off repair rather than the job.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Rows to check' })).toBeVisible();

  // Commits as he types — no blur needed, and the field deliberately stays
  // mounted so a half-typed value cannot unmount it mid-entry.
  const correction = page.getByLabel(/Correct MDF BAR PAIR/).first();
  await correction.fill('01/Z1234');

  await page.getByRole('button', { name: 'Back' }).click();

  // Corrected: it now has a real frame position and the flag is gone.
  await page.getByRole('button', { name: /^All/ }).click();

  // Search rather than scan the DOM: the list is virtualised, and now that the
  // window actually follows the scroll, a corrected row sorts into its real
  // frame position and is simply not rendered until you go to it.
  await page.getByLabel('Search jobs').fill('01/Z1234');
  await expect(page.locator('.tag--position', { hasText: '01/Z1234' })).toHaveCount(1);
  await page.getByLabel('Search jobs').fill('');

  // One of the two flagged rows is repaired, so the attention filter now holds
  // only the other one (a malformed old-equipment ref, which this did not fix).
  await page.getByRole('button', { name: /Needs attention/ }).first().click();
  await expect(page.locator('.card')).toHaveCount(1);
});
