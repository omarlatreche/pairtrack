/**
 * The top of the job list on a phone — BRIEF §7.2, §7.4.
 *
 * Two things he reported as "sloppy… overhanging", both only visible in a real
 * layout (scrollWidth and text metrics are 0 in jsdom):
 *
 *   1. The progress ring label. `done/total` on one line outgrew the ring as
 *      soon as the done count reached two digits — measured before the fix at
 *      41px of text inside a 38px inner circle for `17/442`, and 48.5px, wider
 *      than the whole 46px ring, for `103/442`.
 *   2. The filter chip rows. Both are wider than a 390px screen and their
 *      scrollbar is hidden by design, so a chip was cut clean through at the
 *      screen edge with nothing to say the row scrolls. Measured before the fix:
 *      the status row overflows its container by ~200px and the type row by
 *      ~300px.
 *
 * All references in this file are fabricated.
 * no-data-scan: synthetic
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
  packPath = join(mkdtempSync(join(tmpdir(), 'pairtrack-chips-')), 'TEST-PACK 100000 VC.xlsx');
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

/** What each row currently reports, plus whether the fade is really painted. */
function rowStates(page: Page) {
  return page.$$eval('.chiprow', (rows) =>
    rows.map((row) => ({
      more: row.getAttribute('data-more'),
      overflowBy: row.scrollWidth - row.clientWidth,
      // The attribute is only worth anything if the stylesheet acts on it.
      masked: getComputedStyle(row).maskImage !== 'none',
    })),
  );
}

test('a chip row that overflows says so, on the side the chips are on', async ({ page }) => {
  await setUp(page);

  const atRest = await rowStates(page);
  expect(atRest.length).toBe(2);

  for (const row of atRest) {
    // Guard the premise: if a future pack made the row fit, "end" would be
    // wrong and this test would be asserting nothing.
    expect(row.overflowBy, 'row does not overflow, so there is nothing to fade').toBeGreaterThan(0);
    expect(row.more).toBe('end');
    expect(row.masked).toBe(true);
  }

  // Scrolled to the far end there is nothing more to the right, and saying so
  // is what tells him he has seen every filter.
  await page.evaluate(() => {
    const [status, types] = [...document.querySelectorAll('.chiprow')];
    if (status !== undefined) status.scrollLeft = 9999;
    if (types !== undefined) types.scrollLeft = 100;
  });
  await expect
    .poll(async () => (await rowStates(page)).map((row) => row.more))
    .toEqual(['start', 'both']);
});

test('a row that fits is not faded', async ({ page }) => {
  await setUp(page);

  // The table breakpoint is 900px; at that width the chips have room.
  await page.setViewportSize({ width: 900, height: 844 });

  await expect.poll(async () => (await rowStates(page)).every((row) => row.more === 'none')).toBe(
    true,
  );
  expect((await rowStates(page)).every((row) => row.masked)).toBe(false);
});

/**
 * The counts he will actually see. Driven by setting the text rather than by
 * marking jobs: reaching three digits through the UI is 100+ taps, and what is
 * being asserted is the label's layout, not the counting.
 */
test('the ring label stays inside the ring at every count', async ({ page }) => {
  await setUp(page);

  // The ring reads its numbers out for a screen reader; the visible label is
  // aria-hidden and split in two, so the accessible name is the real check that
  // both numbers are still there.
  await expect(page.locator('.ring')).toHaveAttribute(
    'aria-label',
    `0 of ${TOTAL_JOBS} jobs completed`,
  );

  const fits = await page.evaluate(() => {
    const ring = document.querySelector('.ring');
    const done = document.querySelector('.ring__done');
    const total = document.querySelector('.ring__total');
    if (ring === null || done === null || total === null) return null;

    // Inside the 4px stroke, which is where the label has to stay to look
    // deliberate rather than overflowing.
    const inner = ring.getBoundingClientRect().width - 8;

    return [
      ['0', '442'],
      ['17', '442'],
      ['103', '442'],
      ['442', '442'],
      // Next week's pack is a different size, so four digits has to work too.
      ['1037', '1200'],
    ].map(([d, t]) => {
      done.textContent = d ?? '';
      total.textContent = t ?? '';
      const widest = Math.max(
        done.getBoundingClientRect().width,
        total.getBoundingClientRect().width,
      );
      return { label: `${d}/${t}`, widest: Math.round(widest), inner, fits: widest <= inner };
    });
  });

  expect(fits, 'the ring label is not split into .ring__done / .ring__total').not.toBeNull();
  for (const row of fits ?? []) {
    expect(row.fits, `${row.label} is ${row.widest}px inside a ${row.inner}px circle`).toBe(true);
  }
});
