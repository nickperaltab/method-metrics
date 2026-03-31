import { test, expect } from '@playwright/test';

const TRACKER_URL = 'https://nickperaltab.github.io/method-metrics/tracker.html';

test.describe('Type System: Two Types Only', () => {
  test('type filter dropdown only shows Primitive and Derived', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#filter-count')).toBeVisible();

    const typeFilter = page.locator('#f-type');
    const options = await typeFilter.locator('option').allTextContents();

    // Should only have All, Primitive, Derived
    expect(options).toEqual(['All', 'Primitive', 'Derived']);
  });

  test('inline type dropdown only shows Primitive and Derived', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    const firstRow = page.locator('.data-row').first();
    const typeSelect = firstRow.locator('select').first();
    const options = await typeSelect.locator('option').allTextContents();

    expect(options).toEqual(['Primitive', 'Derived']);
  });

  test('no legacy type groups appear in table', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    // These old group names should NOT appear
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Foundational');
    expect(bodyText).not.toContain('Transforms');
    expect(bodyText).not.toContain('Composite');
    expect(bodyText).not.toContain('Dimensions');
    expect(bodyText).not.toContain('Breakdowns');
    expect(bodyText).not.toContain('Catalog');
  });

  test('metrics are grouped under Primitives or Derived headers', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    // Should have at least the Primitives group
    await expect(page.locator('.group-primitive')).toBeVisible();
  });
});
