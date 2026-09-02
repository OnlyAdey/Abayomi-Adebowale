const { test, expect } = require('@playwright/test');

async function claim(request, itemId, email, name, rid) {
  const res = await request.post('/api/gifts/claim', {
    data: { guest_name: name, email, item_id: itemId, request_id: rid }
  });
  return { status: res.status(), body: await res.json() };
}

test.describe('Gift availability limits (server-enforced)', () => {
  test('available gift accepts a claim', async ({ request }) => {
    const r = await claim(request, 'gift-2', 'limit-a@example.com', 'Limit A', 'limit-a');
    expect(r.status).toBe(201);
  });

  test('fully claimed max=1 gift rejects a second guest', async ({ request }) => {
    const r1 = await claim(request, 'gift-3', 'limit-b@example.com', 'Limit B', 'limit-b');
    expect(r1.status).toBe(201);
    const r2 = await claim(request, 'gift-3', 'limit-c@example.com', 'Limit C', 'limit-c');
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe('gift_unavailable');
  });

  test('multiple-quantity gift accepts up to its max then rejects', async ({ request }) => {
    for (let i = 1; i <= 3; i++) {
      const r = await claim(request, 'gift-20', `mq-${i}@example.com`, `MQ ${i}`, `mq-${i}`);
      expect(r.status).toBe(201);
    }
    const r4 = await claim(request, 'gift-20', 'mq-4@example.com', 'MQ 4', 'mq-4');
    expect(r4.status).toBe(409);
  });

  test('two simultaneous attempts for the final slot: exactly one wins', async ({ request }) => {
    await claim(request, 'gift-21', 'conc-1@example.com', 'Conc 1', 'conc-1');
    await claim(request, 'gift-21', 'conc-2@example.com', 'Conc 2', 'conc-2');

    const [a, b] = await Promise.all([
      claim(request, 'gift-21', 'conc-3@example.com', 'Conc 3', 'conc-3'),
      claim(request, 'gift-21', 'conc-4@example.com', 'Conc 4', 'conc-4')
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  test('badges reflect server availability after reload', async ({ page, request }) => {
    await claim(request, 'gift-4', 'badge@example.com', 'Badge Tester', 'badge-1');
    await page.goto('/');
    await expect(page.locator('.registry-item[data-item="gift-4"] .status-badge')).toHaveText('Taken');
  });
});
