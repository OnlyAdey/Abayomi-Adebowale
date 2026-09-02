const { test, expect } = require('@playwright/test');

test.describe('Server-side validation', () => {
  test('gift claim: empty name rejected', async ({ request }) => {
    const res = await request.post('/api/gifts/claim', { data: { guest_name: '', email: 'v@example.com', item_id: 'gift-1' } });
    expect(res.status()).toBe(400);
  });

  test('gift claim: invalid email rejected', async ({ request }) => {
    const res = await request.post('/api/gifts/claim', { data: { guest_name: 'Valid Name', email: 'not-an-email', item_id: 'gift-1' } });
    expect(res.status()).toBe(400);
  });

  test('gift claim: missing gift id rejected', async ({ request }) => {
    const res = await request.post('/api/gifts/claim', { data: { guest_name: 'Valid Name', email: 'v2@example.com' } });
    expect(res.status()).toBe(400);
  });

  test('gift claim: invalid gift id rejected', async ({ request }) => {
    const res = await request.post('/api/gifts/claim', { data: { guest_name: 'Valid Name', email: 'v3@example.com', item_id: 'gift-999' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('invalid_gift');
  });

  test('cash: zero amount rejected', async ({ request }) => {
    const res = await request.post('/api/cash', { data: { full_name: 'V Tester', email: 'v4@example.com', amount: '0' } });
    expect(res.status()).toBe(400);
  });

  test('cash: negative amount rejected', async ({ request }) => {
    const res = await request.post('/api/cash', { data: { full_name: 'V Tester', email: 'v5@example.com', amount: '-50' } });
    expect(res.status()).toBe(400);
  });

  test('cash: non-numeric amount rejected', async ({ request }) => {
    const res = await request.post('/api/cash', { data: { full_name: 'V Tester', email: 'v6@example.com', amount: 'abc' } });
    expect(res.status()).toBe(400);
  });

  test('cash: invalid email rejected', async ({ request }) => {
    const res = await request.post('/api/cash', { data: { full_name: 'V Tester', email: 'bad-email', amount: '100' } });
    expect(res.status()).toBe(400);
  });

  test('cash: empty name rejected', async ({ request }) => {
    const res = await request.post('/api/cash', { data: { full_name: '', email: 'v7@example.com', amount: '100' } });
    expect(res.status()).toBe(400);
  });
});
