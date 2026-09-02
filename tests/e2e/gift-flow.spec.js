const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

test.describe('Physical gift flow', () => {
  test('claim a gift end-to-end and persist it in the database', async ({ page }) => {
    let dialogMessage = '';
    page.on('dialog', (d) => { dialogMessage = d.message(); d.accept(); });

    await page.goto('/');

    const card = page.locator('.registry-item[data-item="gift-1"]');
    await card.click();

    await expect(page.locator('#physicalGiftModal')).toBeVisible();
    await expect(page.locator('#selectedGiftName')).toHaveText('Inverter Refrigerator/Freezer');

    await page.fill('#giftGuestName', 'E2E Gift Tester');
    await page.fill('#giftGuestEmail', 'e2e-gift@example.com');
    await page.fill('#physicalCardNum', 'AA-E2E-001');
    await page.click('#physicalGiftForm .submit-gift-btn');

    // Wait for the async request to complete (modal closes only after the response).
    await expect(page.locator('#physicalGiftModal')).toBeHidden();
    expect(dialogMessage).toContain('Gift claim recorded');

    // Modal closes and the badge flips to Taken based on server state.
    await expect(page.locator('#physicalGiftModal')).toBeHidden();
    await expect(page.locator('.registry-item[data-item="gift-1"] .status-badge')).toHaveText('Taken');

    // Verify the actual database record.
    const row = await db.get(
      'SELECT guest_name, email, card_num, item_id, item_name, created_at FROM gifts WHERE item_id = ? AND email = ?',
      ['gift-1', 'e2e-gift@example.com']
    );
    expect(row).not.toBeNull();
    expect(row.guest_name).toBe('E2E Gift Tester');
    expect(row.card_num).toBe('AA-E2E-001');
    expect(row.item_id).toBe('gift-1');
    expect(row.item_name).toBe('Inverter Refrigerator/Freezer');
    expect(row.created_at).toBeTruthy();
  });
});
