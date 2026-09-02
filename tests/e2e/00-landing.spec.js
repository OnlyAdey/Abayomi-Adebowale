const { test, expect } = require('@playwright/test');

test.describe('Landing page', () => {
  test('loads with major sections and no critical script errors', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    await expect(page.locator('#story')).toBeVisible();
    await expect(page.locator('#schedule')).toBeVisible();
    await expect(page.locator('#gifts')).toBeVisible();
    await expect(page.locator('#cash-gift')).toBeVisible();
    await expect(page.locator('#digital-clock')).toBeVisible();
    await expect(page.locator('.registry-item')).toHaveCount(22);

    // Availability badge is driven by the server response.
    await expect(page.locator('.registry-item[data-item="gift-1"] .status-badge')).toHaveText('Available');
    await expect(page.locator('.registry-item[data-item="gift-20"] .status-badge')).toHaveText('Available');

    // No uncaught exceptions; ignore benign CDN resource failures.
    expect(pageErrors).toEqual([]);
    const realConsoleErrors = consoleErrors.filter((t) => !/Failed to load resource|ERR_|net::/i.test(t));
    expect(realConsoleErrors).toEqual([]);
  });

  test('mobile menu toggle opens the navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const nav = page.locator('#mobileNav');
    await expect(nav).toBeHidden();
    await page.click('#menuToggleBtn');
    await expect(nav).toBeVisible();
  });
});
