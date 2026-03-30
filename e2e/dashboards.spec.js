import { test, expect } from '@playwright/test';

const DASHBOARDS_URL = 'https://nickperaltab.github.io/method-metrics/builder/#/dashboards';

test.describe('Dashboards: List View', () => {
  test('loads and displays dashboards', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    // Should have at least one dashboard card
    const dashboardCards = page.locator('text=/\\d+ charts?/');
    expect(await dashboardCards.count()).toBeGreaterThan(0);
  });

  test('shows New Dashboard button', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=+ New Dashboard')).toBeVisible();
  });

  test('shows Chart Library section', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=Chart Library')).toBeVisible();
  });

  test('each dashboard shows chart count and date', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    // Check for the pattern "N chart(s) · date"
    const chartInfo = page.locator('text=/\\d+ charts? ·/');
    expect(await chartInfo.count()).toBeGreaterThan(0);
  });
});

test.describe('Dashboards: Detail View', () => {
  test('clicking a dashboard opens its detail view', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    // Find a dashboard with charts and click it
    const dashboardWithCharts = page.locator('text=/[1-9]\\d* charts?/').first();
    if (await dashboardWithCharts.count() > 0) {
      // Get the parent clickable element
      await dashboardWithCharts.click();

      // Should navigate to dashboard detail (URL contains a UUID)
      await expect(page).toHaveURL(/\/dashboards\/[a-f0-9-]+/);
    }
  });

  test('dashboard detail shows back button', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    // Click first dashboard with charts
    const dashboardWithCharts = page.locator('text=/[1-9]\\d* charts?/').first();
    if (await dashboardWithCharts.count() > 0) {
      await dashboardWithCharts.click();
      await expect(page.locator('text=\u2190')).toBeVisible({ timeout: 10000 });
    }
  });

  test('dashboard detail shows chart titles', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    const dashboardWithCharts = page.locator('text=/[1-9]\\d* charts?/').first();
    if (await dashboardWithCharts.count() > 0) {
      await dashboardWithCharts.click();

      // Should show chart cards with edit/remove buttons
      await expect(page.locator('button[title="Edit chart"], button:has-text("\\u270E")').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('dashboard detail shows Add Chart button', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    const dashboardWithCharts = page.locator('text=/[1-9]\\d* charts?/').first();
    if (await dashboardWithCharts.count() > 0) {
      await dashboardWithCharts.click();
      await expect(page.locator('text=+ Add Chart')).toBeVisible({ timeout: 10000 });
    }
  });

  test('charts show "Connect BigQuery" when unauthenticated', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    const dashboardWithCharts = page.locator('text=/[1-9]\\d* charts?/').first();
    if (await dashboardWithCharts.count() > 0) {
      await dashboardWithCharts.click();
      await expect(page.locator('text=Connect BigQuery to load charts').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('back button returns to dashboard list', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=My Dashboards')).toBeVisible();

    const dashboardWithCharts = page.locator('text=/[1-9]\\d* charts?/').first();
    if (await dashboardWithCharts.count() > 0) {
      await dashboardWithCharts.click();
      await expect(page.locator('text=\u2190')).toBeVisible({ timeout: 10000 });

      // Click back
      await page.locator('text=\u2190').click();

      // Should be back on list
      await expect(page.locator('text=My Dashboards')).toBeVisible();
    }
  });
});

test.describe('Dashboards: Navigation', () => {
  test('nav bar is present', async ({ page }) => {
    await page.goto(DASHBOARDS_URL);
    await expect(page.locator('text=METHOD')).toBeVisible();
    await expect(page.locator('text=Chat')).toBeVisible();
    await expect(page.locator('text=Dashboards')).toBeVisible();
    await expect(page.locator('text=Metrics')).toBeVisible();
  });
});
