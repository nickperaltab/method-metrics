import { test, expect } from '@playwright/test';

const BASE_URL = 'https://nickperaltab.github.io/method-metrics/builder/';

test.describe('App Shell: Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure user is selected so picker doesn't block
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    const hasPicker = await page.getByText('Who are you?').isVisible().catch(() => false);
    if (hasPicker) {
      await page.getByText('Justin').click();
    }
  });

  test('sidebar renders on home page', async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test('sidebar shows key sections', async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toContainText('Home');
    await expect(sidebar).toContainText('Chart Builder');
    await expect(sidebar).toContainText('My Dashboards');
    await expect(sidebar).toContainText('Admin');
    await expect(sidebar).toContainText('Metric Registry');
    await expect(sidebar).toContainText('Dimensions');
  });

  test('sidebar is present on every route', async ({ page }) => {
    const routes = ['#/', '#/chat', '#/dashboards', '#/admin/registry', '#/admin/dimensions', '#/approved'];

    for (const route of routes) {
      await page.goto(BASE_URL + route, { waitUntil: 'networkidle' });
      await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    }
  });
});

test.describe('App Shell: Routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    const hasPicker = await page.getByText('Who are you?').isVisible().catch(() => false);
    if (hasPicker) {
      await page.getByText('Justin').click();
    }
  });

  test('home page loads', async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    await expect(page.getByText('Metrics Hub')).toBeVisible();
  });

  test('chart builder route loads', async ({ page }) => {
    await page.goto(BASE_URL + '#/chat', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Connect BigQuery' })).toBeVisible();
  });

  test('dashboards route loads', async ({ page }) => {
    await page.goto(BASE_URL + '#/dashboards', { waitUntil: 'networkidle' });
    await expect(page.getByText('My Dashboards')).toBeVisible();
  });

  test('registry placeholder loads', async ({ page }) => {
    await page.goto(BASE_URL + '#/admin/registry', { waitUntil: 'networkidle' });
    await expect(page.getByText('Metric Registry')).toBeVisible();
  });

  test('dimensions placeholder loads', async ({ page }) => {
    await page.goto(BASE_URL + '#/admin/dimensions', { waitUntil: 'networkidle' });
    await expect(page.getByText('Dimensions')).toBeVisible();
  });

  test('approved dashboards placeholder loads', async ({ page }) => {
    await page.goto(BASE_URL + '#/approved', { waitUntil: 'networkidle' });
    await expect(page.getByText('Approved Dashboards')).toBeVisible();
  });
});

test.describe('App Shell: Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    const hasPicker = await page.getByText('Who are you?').isVisible().catch(() => false);
    if (hasPicker) {
      await page.getByText('Justin').click();
    }
  });

  test('clicking sidebar nav navigates to correct route', async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });

    // Click Chart Builder in sidebar
    const sidebar = page.locator('[data-testid="sidebar"]');
    await sidebar.getByText('Chart Builder').click();
    await expect(page).toHaveURL(/\/#\/chat/);
  });

  test('active nav item is highlighted', async ({ page }) => {
    await page.goto(BASE_URL + '#/chat', { waitUntil: 'networkidle' });

    // The Chart Builder link should have the active style (green color)
    const chatLink = page.locator('[data-testid="sidebar"] a[href="#/chat"]');
    const color = await chatLink.evaluate(el => getComputedStyle(el).color);
    // Active color should be green (#34d399 = rgb(52, 211, 153))
    expect(color).toContain('52');
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });

    // Navigate forward: Home → Chat → Dashboards
    const sidebar = page.locator('[data-testid="sidebar"]');
    await sidebar.getByText('Chart Builder').click();
    await expect(page).toHaveURL(/\/#\/chat/);

    await sidebar.getByText('All Dashboards').click();
    await expect(page).toHaveURL(/\/#\/dashboards/);

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/\/#\/chat/);

    // Go back again
    await page.goBack();
    await expect(page).toHaveURL(/\/#\//);
  });
});

test.describe('App Shell: BQ Connection', () => {
  test('Connect BigQuery button visible in top bar', async ({ page }) => {
    await page.goto(BASE_URL + '#/', { waitUntil: 'networkidle' });
    const hasPicker = await page.getByText('Who are you?').isVisible().catch(() => false);
    if (hasPicker) {
      await page.getByText('Justin').click();
    }

    await expect(page.getByRole('button', { name: 'Connect BigQuery' })).toBeVisible();
  });
});
