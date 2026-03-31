import { test, expect } from '@playwright/test';

const BUILDER_URL = 'https://nickperaltab.github.io/method-metrics/builder/';

test.describe('User System: First Visit Picker', () => {
  test('shows user picker when no user in localStorage', async ({ page }) => {
    // Clear any stored user
    await page.goto(BUILDER_URL + '#/chat');
    await page.evaluate(() => localStorage.removeItem('method_metrics_user'));
    await page.reload({ waitUntil: 'networkidle' });

    // Picker should appear
    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 10000 });
  });

  test('picker shows available users', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await page.evaluate(() => localStorage.removeItem('method_metrics_user'));
    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 10000 });
    // Should show at least Justin and Nic
    await expect(page.getByText('Justin')).toBeVisible();
    await expect(page.getByText('Nic')).toBeVisible();
  });

  test('selecting a user dismisses picker and shows name in nav', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await page.evaluate(() => localStorage.removeItem('method_metrics_user'));
    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 10000 });

    // Click Justin
    await page.getByText('Justin').click();

    // Picker should disappear
    await expect(page.getByText('Who are you?')).not.toBeVisible();

    // Name should show in top bar
    await expect(page.locator('text=Justin')).toBeVisible();
  });
});

test.describe('User System: Persistence', () => {
  test('user selection persists across page reload', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await page.evaluate(() => localStorage.removeItem('method_metrics_user'));
    await page.reload({ waitUntil: 'networkidle' });

    // Pick a user
    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 10000 });
    await page.getByText('Justin').click();
    await expect(page.getByText('Who are you?')).not.toBeVisible();

    // Reload
    await page.reload({ waitUntil: 'networkidle' });

    // Picker should NOT show again
    await expect(page.getByText('Who are you?')).not.toBeVisible({ timeout: 5000 });
    // Name should still show
    await expect(page.locator('text=Justin')).toBeVisible();
  });
});

test.describe('User System: Switch User', () => {
  test('switch button re-opens picker', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await page.evaluate(() => localStorage.removeItem('method_metrics_user'));
    await page.reload({ waitUntil: 'networkidle' });

    // Pick Justin
    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 10000 });
    await page.getByText('Justin').click();
    await expect(page.getByText('Who are you?')).not.toBeVisible();

    // Click switch
    await page.getByText('switch').click();

    // Picker should reappear
    await expect(page.getByText('Who are you?')).toBeVisible();
  });

  test('switching to different user updates nav', async ({ page }) => {
    await page.goto(BUILDER_URL + '#/chat');
    await page.evaluate(() => localStorage.removeItem('method_metrics_user'));
    await page.reload({ waitUntil: 'networkidle' });

    // Pick Justin first
    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 10000 });
    await page.getByText('Justin').click();

    // Switch
    await page.getByText('switch').click();
    await expect(page.getByText('Who are you?')).toBeVisible();

    // Pick Nic
    await page.getByText('Nic').click();
    await expect(page.getByText('Who are you?')).not.toBeVisible();

    // Nav should show Nic, not Justin
    const navBar = page.locator('[style*="border-bottom"]').first();
    await expect(navBar).toContainText('Nic');
  });
});
