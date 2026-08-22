/**
 * The offline check — BRIEF §11.
 *
 * "With the device in aeroplane mode from a cold start: launches, unlocks,
 * loads all 442 jobs, records 20 status changes, survives a force quit, and
 * still has them."
 *
 * `context.setOffline(true)` is the browser's own aeroplane mode: every network
 * request fails at the transport layer, exactly as it does in a basement. A
 * `page.reload()` with a closed context in between is the closest a test can
 * get to a force quit — the page is destroyed and re-created from disk.
 *
 * All references in this file are fabricated.
 * no-data-scan: synthetic
 */
import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSyntheticPack } from './fixtures/makePack';

const PASSPHRASE = 'purple frame ladder Tuesday';
const TOTAL_JOBS = 442;

let scratchDir: string;
let packPath: string;

test.beforeAll(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'pairtrack-offline-'));
  packPath = join(scratchDir, 'TEST-PACK <pack-no redacted> VC.xlsx');
  writeSyntheticPack(packPath, { rows: TOTAL_JOBS });
});

test.afterAll(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

test.setTimeout(180_000);

test('installs, then works entirely in aeroplane mode across a restart', async ({
  page,
  context,
}) => {
  // --- Online once, to install ---------------------------------------------
  await page.goto('/');

  await page.getByLabel('Your name').fill('Test Engineer');
  await page.getByLabel('Create a passphrase').fill(PASSPHRASE);
  await page.getByLabel('Type it again').fill(PASSPHRASE);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create and continue' }).click();
  await expect(page.getByText('No job pack yet')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Import a job pack' }).click();
  await page.setInputFiles('input[type="file"]', packPath);
  await expect(page.getByText('Check the columns')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: `Import ${TOTAL_JOBS} jobs` }).click();
  await page.getByRole('button', { name: 'Go to the jobs' }).click();
  await expect(page.locator('.card').first()).toBeVisible();

  // Wait until the app is genuinely installed. Three conditions, and all three
  // matter — an active worker whose cache is still filling, or a populated
  // cache the page is not yet controlled by, both look ready and are not.
  const precached = await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) return false;
      // The page must actually be CONTROLLED, or the next navigation goes
      // straight to the network and offline proves nothing.
      if (navigator.serviceWorker.controller === null) return false;

      const names = await caches.keys();
      if (names.length === 0) return false;
      const keys = await (await caches.open(names[0] as string)).keys();
      return keys.length > 5 ? keys.length : false;
    },
    undefined,
    { timeout: 30_000 },
  );

  expect(await precached.jsonValue()).toBeGreaterThan(5);

  // --- Aeroplane mode, from here on ----------------------------------------
  await context.setOffline(true);

  // Cold start: destroy the page and load it again with no network at all.
  await page.reload();
  await expect(page.getByLabel('Passphrase')).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('Passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();

  // All 442 jobs, offline.
  await expect(page.getByRole('button', { name: /^All/ })).toContainText(String(TOTAL_JOBS), {
    timeout: 60_000,
  });

  // --- Record 20 status changes, offline -----------------------------------
  await page.getByRole('button', { name: /^Outstanding/ }).click();
  for (let i = 0; i < 20; i += 1) {
    await page.locator('button.mark--pass').first().click();
    await expect(page.getByRole('button', { name: /^Outstanding/ })).toContainText(
      String(TOTAL_JOBS - 1 - i),
    );
  }

  // --- Force quit: a new page in the same profile, still offline ------------
  await page.waitForTimeout(1200); // let the debounced write land
  await page.close();

  const revived = await context.newPage();
  await revived.goto('/');
  await expect(revived.getByLabel('Passphrase')).toBeVisible({ timeout: 30_000 });

  await revived.getByLabel('Passphrase').fill(PASSPHRASE);
  await revived.getByRole('button', { name: 'Unlock' }).click();

  // Not a single tick lost.
  await expect(revived.getByRole('button', { name: /^Activated/ })).toContainText('20', {
    timeout: 60_000,
  });
  await expect(revived.getByRole('button', { name: /^All/ })).toContainText(String(TOTAL_JOBS));

  // Marking still works with no network.
  await revived.locator('button.mark--pass').first().click();
  await expect(revived.locator('.toast')).toBeVisible();

  await context.setOffline(false);
});

test('a stale asset request does not come back as HTML', async ({ page }) => {
  // Regression test. The service worker used to fall through to fetch() on a
  // cache miss; a static host answers an unknown path with index.html, and the
  // browser then rejects that HTML as a module script with a MIME error that
  // looks like a broken app rather than a stale worker.
  await page.goto('/');

  // `(await getRegistration())?.active !== undefined` would be true the instant
  // there is no registration at all, so wait on the controller instead — that
  // is what actually proves requests are going through the worker.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });

  const result = await page.evaluate(async () => {
    const response = await fetch('./assets/does-not-exist-abcdef.js');
    return { status: response.status, type: response.headers.get('content-type') };
  });

  expect(result.status).toBe(504);
  expect(result.type).toContain('text/plain');
});
