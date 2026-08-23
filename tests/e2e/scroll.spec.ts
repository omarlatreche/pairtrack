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
