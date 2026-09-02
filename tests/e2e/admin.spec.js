const { test, expect } = require('@playwright/test');

test.describe('Admin dashboard', () => {
  test('invalid login stays locked out', async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#adminPassInput', 'wrong-password');
    await page.click('#loginOverlay .btn-primary');
    await expect(page.locator('#loginError')).toBeVisible();
    await expect(page.locator('#dashboard')).toBeHidden();
  });

  test('valid login, view gifts and payments, logout', async ({ page, request }) => {
    // Seed one payment and one gift claim through the API first.
    await request.post('/api/cash', {
      data: { full_name: 'Admin View Tester', email: 'admin-view@example.com', amount: '25000', card_num: 'AA-ADMIN' }
    });
    await request.post('/api/gifts/claim', {
      data: { guest_name: 'Admin Gift Tester', email: 'admin-gift@example.com', item_id: 'gift-8', card_num: 'AA-ADMIN-G' }
    });

    await page.goto('/admin.html');
    await page.fill('#adminPassInput', 'test-admin-pw');
    await page.click('#loginOverlay .btn-primary');
    await expect(page.locator('#dashboard')).toBeVisible();

    // Gifts tab: names, emails, items, invitation card numbers.
    await page.click('[data-tab="gifts"]');
    await expect(page.locator('#content')).toContainText('Admin Gift Tester');
    await expect(page.locator('#content')).toContainText('admin-gift@example.com');
    await expect(page.locator('#content')).toContainText('Electric Iron + Ironing Board');
    await expect(page.locator('#content')).toContainText('AA-ADMIN-G');

    // Payments tab: names, emails, amounts, card numbers, verification status.
    await page.click('[data-tab="payments"]');
    await expect(page.locator('#content')).toContainText('Admin View Tester');
    await expect(page.locator('#content')).toContainText('admin-view@example.com');
    await expect(page.locator('#content')).toContainText('25000');
    await expect(page.locator('#content')).toContainText('AA-ADMIN');
    await expect(page.locator('#content')).toContainText('No'); // verified=No

    // Logout returns to the login screen.
    await page.click('.btn-logout');
    await expect(page.locator('#loginOverlay')).toBeVisible();
    await expect(page.locator('#dashboard')).toBeHidden();
  });
});
