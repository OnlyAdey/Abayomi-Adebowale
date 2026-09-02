const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

test.describe('Cash gift flow', () => {
  test('cash gift end-to-end and persist it in the database', async ({ page }) => {
    let dialogMessage = '';
    page.on('dialog', (d) => { dialogMessage = d.message(); d.accept(); });

    await page.goto('/');

    await page.fill('#cashAmount', '75000');
    await page.fill('#cashName', 'E2E Cash Tester');
    await page.fill('#cashEmail', 'e2e-cash@example.com');
    await page.fill('#cashCardNum', 'AA-E2E-CASH');
    await page.click('#cashForm button[type="button"]');

    await expect(page.locator('#bankDetailsModal')).toBeVisible();
    await expect(page.locator('#accNum')).toHaveText('6172622517');

    await page.click('#bankDetailsModal .paid-btn');
    await expect(page.locator('#bankDetailsModal')).toBeHidden();

    expect(dialogMessage).toContain('recorded your gift');

    // Verify the actual database record.
    const row = await db.get(
      'SELECT full_name, email, amount, card_num, verified, created_at FROM payments WHERE email = ?',
      ['e2e-cash@example.com']
    );
    expect(row).not.toBeNull();
    expect(row.full_name).toBe('E2E Cash Tester');
    expect(Number(row.amount)).toBe(75000);
    expect(row.card_num).toBe('AA-E2E-CASH');
    expect(row.verified).toBe(0); // never auto-verified
    expect(row.created_at).toBeTruthy();
  });

  test('duplicate request_id is idempotent - no duplicate rows', async ({ request }) => {
    const body = { full_name: 'Dup Tester', email: 'dup@example.com', amount: '1000', card_num: 'AA-DUP', request_id: 'dup-cash-1' };
    const r1 = await request.post('/api/cash', { data: body });
    const r2 = await request.post('/api/cash', { data: body });
    expect(r1.status()).toBe(201);
    expect(r2.status()).toBe(201);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.duplicate).toBe(false);
    expect(b2.duplicate).toBe(true);
    expect(b1.payment.id).toBe(b2.payment.id);

    const count = await db.get('SELECT COUNT(*) AS n FROM payments WHERE request_id = ?', ['dup-cash-1']);
    expect(Number(count.n)).toBe(1);
  });
});
