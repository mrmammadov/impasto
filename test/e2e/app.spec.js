import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const APP = pathToFileURL(resolve('dist/index.html')).href;
const SAMPLE = resolve('assets/sample.jpg');
const NOT_A_PICTURE = resolve('test/fixtures/not-a-picture.txt');
const painted = /strokes in/;

/** Open the app with a clean slate and collect page errors. */
async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#status')).toHaveText(painted, { timeout: 60_000 });
  return errors;
}

test('paints the sample and shows it in relief, without errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('[data-view="relief"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#frame')).toHaveClass(/lit/);
  expect(errors).toEqual([]);
});

test('view modes: flat, relief, and 3D asks before downloading', async ({ page }) => {
  await open(page);
  await page.locator('[data-view="flat"]').click();
  await expect(page.locator('#frame')).not.toHaveClass(/lit/);

  await page.locator('[data-view="3d"]').click();
  await expect(page.locator('#depthConfirm')).toBeVisible();
  await expect(page.locator('[data-view="flat"]')).toHaveAttribute('aria-checked', 'true'); // nothing changed yet
  await page.locator('#depthCancel').click();
  await expect(page.locator('#depthConfirm')).toBeHidden();

  await page.locator('[data-view="relief"]').click();
  await expect(page.locator('#frame')).toHaveClass(/lit/);
});

test('a chosen picture is painted; a non-picture is refused', async ({ page }) => {
  await open(page);
  await page.locator('#file').setInputFiles(NOT_A_PICTURE);
  await expect(page.locator('#status')).toHaveText(/not a picture/);

  await page.locator('#file').setInputFiles(SAMPLE);
  await expect(page.locator('#dropHint')).toBeHidden();
  await expect(page.locator('#status')).toHaveText(painted, { timeout: 60_000 });
});

test('choosing a style repaints with it', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Palette knife' }).click();
  await expect(page.getByRole('radio', { name: 'Palette knife' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#status')).toHaveText(painted, { timeout: 60_000 });
});

test('theme toggle switches and is remembered', async ({ page }) => {
  await open(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const before = await page.locator('#theme').getAttribute('aria-label');
  await page.locator('#theme').click();
  const chosen = await theme();
  expect(['light', 'dark']).toContain(chosen);
  await expect(page.locator('#theme')).not.toHaveAttribute('aria-label', before);
  await page.reload();
  expect(await theme()).toBe(chosen);
});

test('keyboard: arrow keys move through the View options', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no hardware keyboard on phones');
  await open(page);
  await page.locator('[data-view="relief"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-view="flat"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-view="flat"]')).toBeFocused();
});

test('fits a phone screen without sideways scrolling', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
