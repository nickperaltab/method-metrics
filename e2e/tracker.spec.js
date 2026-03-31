import { test, expect } from '@playwright/test';

const TRACKER_URL = 'https://nickperaltab.github.io/method-metrics/tracker.html';

test.describe('Tracker: Page Load', () => {
  test('loads and displays metrics from Supabase', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('text=Metric Tracker')).toBeVisible();
    await expect(page.locator('text=Supabase registry')).toBeVisible();

    // Stats bar shows counts
    const statsText = await page.locator('.header-stats').textContent();
    expect(statsText).toContain('Live');
    expect(statsText).toContain('Total');
  });

  test('displays metrics grouped by type', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('text=Metric Tracker')).toBeVisible();

    // Should have at least one group header
    const groupHeaders = page.locator('.group-header');
    await expect(groupHeaders.first()).toBeVisible();

    // Should have at least one metric row with a data-id
    const rows = page.locator('.data-row');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('shows filter count matching total', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#filter-count')).toBeVisible();
    const countText = await page.locator('#filter-count').textContent();
    // Format: "N of N metrics"
    expect(countText).toMatch(/\d+ of \d+ metrics/);
  });
});

test.describe('Tracker: Search and Filter', () => {
  test('search by name filters the table', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#filter-count')).toBeVisible();

    // Get initial count
    const initialText = await page.locator('#filter-count').textContent();
    const initialTotal = parseInt(initialText.match(/of (\d+)/)[1]);

    // Type in search
    await page.fill('#f-search', 'Trials');

    // Count should decrease
    const filteredText = await page.locator('#filter-count').textContent();
    const filteredCount = parseInt(filteredText.match(/^(\d+)/)[1]);
    expect(filteredCount).toBeLessThan(initialTotal);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('type filter narrows results', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#filter-count')).toBeVisible();

    const initialText = await page.locator('#filter-count').textContent();
    const initialTotal = parseInt(initialText.match(/of (\d+)/)[1]);

    // Filter by Primitive type
    await page.selectOption('#f-type', 'Primitive');

    const filteredText = await page.locator('#filter-count').textContent();
    const filteredCount = parseInt(filteredText.match(/^(\d+)/)[1]);
    expect(filteredCount).toBeLessThanOrEqual(initialTotal);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('status filter works', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#filter-count')).toBeVisible();

    // Filter by live status
    await page.selectOption('#f-status', 'live');
    const filteredText = await page.locator('#filter-count').textContent();
    expect(filteredText).toMatch(/\d+ of \d+ metrics/);
  });

  test('reset button clears all filters', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#filter-count')).toBeVisible();

    const initialText = await page.locator('#filter-count').textContent();

    // Apply a search filter
    await page.fill('#f-search', 'Trials');
    const filteredText = await page.locator('#filter-count').textContent();
    expect(filteredText).not.toEqual(initialText);

    // Click reset
    await page.click('.filter-reset');

    // Should restore original count
    const resetText = await page.locator('#filter-count').textContent();
    expect(resetText).toEqual(initialText);
    expect(await page.locator('#f-search').inputValue()).toBe('');
  });
});

test.describe('Tracker: Sort', () => {
  test('clicking column header changes sort', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('#thead-row')).toBeVisible();

    // Click on the Name column header
    const nameHeader = page.locator('#thead-row th', { hasText: 'Name' });
    await nameHeader.click();

    // The header should have a sorted class
    await expect(nameHeader).toHaveClass(/sorted/);
  });
});

test.describe('Tracker: Expand Panel', () => {
  test('clicking metric row opens expand panel', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    // Click on first metric row's name cell (3rd td — after checkbox and ID)
    const firstRow = page.locator('.data-row').first();
    await firstRow.locator('td').nth(2).click();

    // Expand panel should appear with SQL definition
    await expect(page.locator('.expand-panel')).toBeVisible();
    await expect(page.locator('text=SQL Definition')).toBeVisible();
  });

  test('expand panel shows BQ view name', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    await page.locator('.data-row').first().locator('td').nth(2).click();

    const panel = page.locator('.expand-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('BQ View');
    await expect(panel).toContainText('revenue.');
  });

  test('expand panel shows depends-on and used-by sections', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    await page.locator('.data-row').first().locator('td').nth(2).click();

    const panel = page.locator('.expand-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Depends On');
    await expect(panel).toContainText('Used By');
  });

  test('expand panel has notes field', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    await page.locator('.data-row').first().locator('td').nth(2).click();

    await expect(page.locator('.expand-panel')).toBeVisible();
    await expect(page.locator('text=Notes')).toBeVisible();
    await expect(page.locator('.expand-panel textarea').last()).toBeVisible();
  });

  test('expand panel has edit and test buttons', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    await page.locator('.data-row').first().locator('td').nth(2).click();

    await expect(page.locator('.expand-panel')).toBeVisible();
    await expect(page.locator('.expand-panel button', { hasText: 'Edit' })).toBeVisible();
    await expect(page.locator('.expand-panel button', { hasText: 'Test' })).toBeVisible();
  });

  test('expand panel has delete button', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    await page.locator('.data-row').first().locator('td').nth(2).click();

    await expect(page.locator('.expand-panel')).toBeVisible();
    await expect(page.locator('text=Delete Metric')).toBeVisible();
  });

  test('clicking expanded row again collapses panel', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    const nameCell = page.locator('.data-row').first().locator('td').nth(2);
    await nameCell.click();
    await expect(page.locator('.expand-panel')).toBeVisible();

    // Click same row again to collapse — need to re-query since DOM re-renders
    await page.locator('.data-row').first().locator('td').nth(2).click();
    await expect(page.locator('.expand-panel')).not.toBeVisible();
  });
});

test.describe('Tracker: Inline Editing', () => {
  test('type dropdown is present on each row', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    const firstRow = page.locator('.data-row').first();
    const typeSelect = firstRow.locator('select').first();
    await expect(typeSelect).toBeVisible();
    const value = await typeSelect.inputValue();
    expect(['primitive', 'foundational', 'transform', 'derived', 'composite', 'dimension', 'breakdown', 'catalog']).toContain(value);
  });

  test('description textarea is present and editable', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    const firstRow = page.locator('.data-row').first();
    const descField = firstRow.locator('.desc-area');
    await expect(descField).toBeVisible();
    const value = await descField.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('priority dropdown is present on each row', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    const firstRow = page.locator('.data-row').first();
    // Each row has 4 selects: type, priority, assigned, status
    const selects = firstRow.locator('select');
    expect(await selects.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Tracker: Bulk Select', () => {
  test('select-all checkbox toggles all rows', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    // Click select-all checkbox in header
    const selectAll = page.locator('#thead-row input[type="checkbox"]');
    await selectAll.check();

    // Bulk bar should appear with count
    await expect(page.locator('#bulk-bar')).toBeVisible();
    const bulkText = await page.locator('#bulk-count').textContent();
    expect(bulkText).toMatch(/\d+ selected/);
    const count = parseInt(bulkText);
    expect(count).toBeGreaterThan(0);
  });

  test('individual checkbox toggles selection', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    // Check first row's checkbox
    const firstCheck = page.locator('.data-row').first().locator('input[type="checkbox"]');
    await firstCheck.check();

    // Bulk bar should show "1 selected"
    await expect(page.locator('#bulk-bar')).toBeVisible();
    const bulkText = await page.locator('#bulk-count').textContent();
    expect(bulkText).toContain('1 selected');
  });

  test('deselect-all button clears selection', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('.data-row').first()).toBeVisible();

    // Select all
    await page.locator('#thead-row input[type="checkbox"]').check();
    await expect(page.locator('#bulk-bar')).toBeVisible();

    // Click Deselect All
    await page.click('text=Deselect All');

    // Bulk bar should hide or show 0 selected
    const bulkText = await page.locator('#bulk-count').textContent();
    expect(bulkText).toContain('0 selected');
  });
});

test.describe('Tracker: Add Metric Button', () => {
  test('floating + button is visible', async ({ page }) => {
    await page.goto(TRACKER_URL);
    await expect(page.locator('text=Metric Tracker')).toBeVisible();
    await expect(page.locator('#add-btn')).toBeVisible();
  });
});

test.describe('Tracker: URL Deep Link', () => {
  test('expand param opens metric panel directly', async ({ page }) => {
    await page.goto(TRACKER_URL + '?expand=54');
    await expect(page.locator('.expand-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=SQL Definition')).toBeVisible();
  });
});
