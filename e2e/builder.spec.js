import { test, expect } from '@playwright/test';

const BUILDER_URL = 'https://nickperaltab.github.io/method-metrics/builder/';

test.describe('Chart Builder: Page Load', () => {
  test('loads chat view with nav bar', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Connect BigQuery' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboards' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Metrics' })).toBeVisible();
  });

  test('shows Connect BigQuery button when unauthenticated', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await expect(page.locator('text=Connect BigQuery')).toBeVisible();
  });

  test('shows pre-auth message when not connected', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await expect(page.locator('text=Connect BigQuery to start chatting')).toBeVisible();
  });
});

test.describe('Chart Builder: Navigation', () => {
  test('Chat link navigates to chat view', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/dashboards');
    await page.click('text=Chat');
    await expect(page).toHaveURL(/\/#\/chat/);
  });

  test('Dashboards link navigates to dashboards view', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await page.click('text=Dashboards');
    await expect(page).toHaveURL(/\/#\/dashboards/);
  });

  test('Metrics link points to tracker', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    const metricsLink = page.locator('a', { hasText: 'Metrics' });
    const href = await metricsLink.getAttribute('href');
    expect(href).toContain('tracker.html');
  });

  test('METHOD logo links to index', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    const logoLink = page.locator('a', { hasText: 'METHOD' });
    const href = await logoLink.getAttribute('href');
    expect(href).toContain('index.html');
  });
});
