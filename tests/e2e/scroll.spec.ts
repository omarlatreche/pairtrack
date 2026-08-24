/**
 * Scrolling a 442-row list — BRIEF §7.3, D17.
 *
 * He reported that completing a job threw him back to the top of the list.
 * Two separate defects produced that, and both are asserted here because the
 * unit suite cannot see either: they only exist in a real layout.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSyntheticPack } from './fixtures/makePack';

const PASSPHRASE = 'purple frame ladder Tuesday';
const TOTAL_JOBS = 442;
let packPath = '';

test.beforeAll(() => {
  packPath = join(mkdtempSync(join(tmpdir(), 'pairtrack-scroll-')), 'TEST-PACK 100000 VC.xlsx');
  writeSyntheticPack(packPath, { rows: TOTAL_JOBS });
});

async function setUp(page: Page) {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Test Engineer');
  await page.getByLabel('Create a passphrase').fill(PASSPHRASE);
  await page.getByLabel('Type it again').fill(PASSPHRASE);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create and continue' }).click();

  await page.getByRole('button', { name: 'Import a job pack' }).click();
  await page.setInputFiles('input[type="file"]', packPath);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: `Import ${TOTAL_JOBS} jobs` }).click();
  await page.getByRole('button', { name: 'Go to the jobs' }).click();
  await page.locator('.card').first().waitFor();
}

/** The index of a card he could actually put a thumb on. */
async function visibleCardIndex(page: Page): Promise<number> {
  const index = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    return cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return rect.top > 300 && rect.bottom < window.innerHeight - 120;
    });
  });
  expect(index, 'no fully visible card to tap').toBeGreaterThanOrEqual(0);
  return index;
}

test('the virtual window follows the scroll instead of sticking at row 0', async ({ page }) => {
  await setUp(page);

  const topSpacer = () =>
    page.evaluate(
      () =>
        (document.querySelector('.list__viewport')?.firstElementChild as HTMLElement)?.style.height,
    );

  expect(await topSpacer()).toBe('0px');

  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);

  // VirtualList used to read scrollTop from a container that never scrolls —
  // the shell is `min-height`, so the PAGE scrolls — leaving the window pinned
  // to the first rows inside a 74,000px spacer, with blank space below.
  const spacer = await topSpacer();
  expect(spacer).not.toBe('0px');
  expect(Number.parseInt(spacer ?? '0', 10)).toBeGreaterThan(1000);

  // And the rows on screen are the ones he scrolled to, not row 0.
  await expect(page.locator('.card').first()).toBeVisible();
});

test('marking a job does not move the list under his thumb', async ({ page }) => {
  await setUp(page);

  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.scrollY);

  const index = await visibleCardIndex(page);
  await page.locator('.card').nth(index).click();
  await page.waitForTimeout(700);

  // Auto-advance used to scroll the NEXT job to the top after every tap. That
  // made sense when marking removed a job from a filtered list; with one tap
  // and no gates the card just turns blue, so scrolling only lost his place.
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(page.locator('.card--pending')).toHaveCount(1);
});

test('tapping a PARTIALLY visible card does not haul it to the top', async ({ page }) => {
  // The case the other test deliberately avoided, and the one he actually hits:
  // the card at the bottom edge, half off screen, which is exactly the one your
  // thumb lands on as you work down the list.
  await setUp(page);

  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.scrollY);

  // A point inside the visible sliver of a card straddling the bottom edge.
  // Tapped by COORDINATE, because locator.click() scrolls the element into view
  // first and would measure Playwright rather than the app.
  const DOCK = 120; // fixed dock + safe area at the bottom
  const point = await page.evaluate((dock) => {
    for (const card of document.querySelectorAll('.card')) {
      const rect = card.getBoundingClientRect();
      // Top on screen and clear of the dock; bottom running off the fold.
      if (rect.top > 300 && rect.top < window.innerHeight - dock - 40 && rect.bottom > window.innerHeight - dock) {
        const x = rect.left + rect.width / 2;
        const y = rect.top + 30;
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('.card')) return { x, y };
      }
    }
    return null;
  }, DOCK);
  expect(point, 'no partially visible card').not.toBeNull();

  await page.touchscreen.tap(point!.x, point!.y);
  await page.waitForTimeout(700);

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('the pending bar appearing does not disturb the list', async ({ page }) => {
  await setUp(page);

  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.scrollY);

  // First tap is the one that makes the sign-off bar appear.
  await page.locator('.card').nth(await visibleCardIndex(page)).click();
  await page.waitForTimeout(700);
  await expect(page.locator('.signoff')).toBeVisible();

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('the sign-off bar sits on the dock, and lifts only for the undo toast', async ({ page }) => {
  await setUp(page);

  const geometry = () =>
    page.evaluate(() => {
      const signoff = document.querySelector('.signoff')?.getBoundingClientRect();
      const dock = document.querySelector('.dock')?.getBoundingClientRect();
      const toast = document.querySelector('.toast')?.getBoundingClientRect();
      return {
        gapToDock: signoff && dock ? Math.round(dock.top - signoff.bottom) : null,
        hasToast: toast !== undefined,
      };
    });

  await page.locator('.card').first().click();
  await expect(page.locator('.signoff')).toBeVisible();

  // While the toast is up, the bar lifts clear of it.
  const withToast = await geometry();
  expect(withToast.hasToast).toBe(true);
  expect(withToast.gapToDock).toBeGreaterThan(50);

  // The toast expires after 6s. The bar must then come down onto the dock —
  // it used to keep the toast's slot reserved forever, leaving it hanging in
  // mid-list above an empty gap whenever there was no undo button.
  await expect(page.locator('.toast')).toBeHidden({ timeout: 10_000 });

  const withoutToast = await geometry();
  expect(withoutToast.hasToast).toBe(false);
  expect(withoutToast.gapToDock).toBeLessThan(20);
  expect(withoutToast.gapToDock).toBeGreaterThanOrEqual(0);
});
