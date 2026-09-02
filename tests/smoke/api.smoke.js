// API smoke suite - exercises every user-facing endpoint end-to-end.
// Usage:
//   node tests/smoke/api.smoke.js                         # SQLite (fresh smoke.sqlite)
//   DATABASE_URL=postgres://... node tests/smoke/api.smoke.js   # PostgreSQL
// Starts the real app on SMOKE_PORT (default 8099) and stops it at the end.
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.SMOKE_PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const usePg = !!process.env.DATABASE_URL;

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

async function api(method, url, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') || '' };
}

(async () => {
  if (usePg) {
    // Clean slate for Postgres runs (throwaway verification database).
    const { Pool } = require('pg');
    const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslMode === 'disable' ? false : { rejectUnauthorized: false } });
    await pool.query('DROP TABLE IF EXISTS payments, gifts, gift_items CASCADE');
    await pool.end();
  } else {
    const sqlitePath = path.join(ROOT, 'smoke.sqlite');
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { fs.rmSync(sqlitePath + suffix, { force: true }); } catch (_) { /* ignore */ }
    }
  }

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test',
    ADMIN_PASSWORD: 'smoke-admin-pw',
    SESSION_SECRET: 'smoke-secret'
  };
  if (!usePg) {
    delete env.DATABASE_URL;
    env.SQLITE_PATH = path.join(ROOT, 'smoke.sqlite');
  }

  const server = spawn(process.execPath, ['index.js'], { cwd: ROOT, env, stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) { up = true; break; }
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    console.error('server did not become healthy');
    server.kill();
    process.exit(1);
  }
  console.log(`server up on :${PORT} (${usePg ? 'postgres' : 'sqlite'})\n`);

  // Health + DB connectivity
  let r = await api('GET', '/api/health');
  check('health returns ok', r.status === 200 && r.json && r.json.status === 'ok', JSON.stringify(r.json));

  r = await api('GET', '/test-db');
  check('test-db reaches the database', r.status === 200 && r.json && r.json.message === 'Database connected!', JSON.stringify(r.json));

  // Catalog
  r = await api('GET', '/api/gifts');
  check('catalog has 22 gifts', r.status === 200 && Array.isArray(r.json) && r.json.length === 22, 'len=' + (r.json && r.json.length));
  const g20 = r.json && r.json.find((g) => g.id === 'gift-20');
  check('gift-20 max_claims=3', g20 && g20.max_claims === 3, JSON.stringify(g20));

  // Gift claim happy path + persistence via admin
  r = await api('POST', '/api/gifts/claim', { body: { guest_name: 'Smoke Gift', email: 'smoke-gift@example.com', card_num: 'AA-SMOKE-1', item_id: 'gift-1', request_id: 'smoke-gift-1' } });
  check('gift claim 201', r.status === 201 && r.json && r.json.duplicate === false, JSON.stringify(r.json));

  r = await api('POST', '/api/gifts/claim', { body: { guest_name: 'Smoke Gift', email: 'smoke-gift@example.com', card_num: 'AA-SMOKE-1', item_id: 'gift-1', request_id: 'smoke-gift-1' } });
  check('duplicate gift request_id is idempotent', [200, 201].includes(r.status) && r.json && r.json.duplicate === true, JSON.stringify(r.json));

  // Max=1 enforcement
  r = await api('POST', '/api/gifts/claim', { body: { guest_name: 'Smoke B', email: 'smoke-b@example.com', item_id: 'gift-1', request_id: 'smoke-gift-1b' } });
  check('second claim on max=1 gift rejected', r.status === 409 && r.json && r.json.error === 'gift_unavailable', JSON.stringify(r.json));

  // Concurrent final slot on gift-21 (max 3): pre-claim 2, then fire 2 at once.
  await api('POST', '/api/gifts/claim', { body: { guest_name: 'Conc A', email: 'conc-a@example.com', item_id: 'gift-21', request_id: 'smoke-ca' } });
  await api('POST', '/api/gifts/claim', { body: { guest_name: 'Conc B', email: 'conc-b@example.com', item_id: 'gift-21', request_id: 'smoke-cb' } });
  const [ra, rb] = await Promise.all([
    api('POST', '/api/gifts/claim', { body: { guest_name: 'Conc C', email: 'conc-c@example.com', item_id: 'gift-21', request_id: 'smoke-cc' } }),
    api('POST', '/api/gifts/claim', { body: { guest_name: 'Conc D', email: 'conc-d@example.com', item_id: 'gift-21', request_id: 'smoke-cd' } })
  ]);
  check('concurrent final slot: exactly one wins', [ra.status, rb.status].sort().join(',') === '201,409', `[${ra.status},${rb.status}]`);

  // Cash happy path
  r = await api('POST', '/api/cash', { body: { full_name: 'Smoke Cash', email: 'smoke-cash@example.com', amount: '75000', card_num: 'AA-SMOKE-C', request_id: 'smoke-cash-1' } });
  check('cash 201 and not verified', r.status === 201 && r.json && r.json.payment.verified === false, JSON.stringify(r.json));

  r = await api('POST', '/api/cash', { body: { full_name: 'Smoke Cash', email: 'smoke-cash@example.com', amount: '75000', card_num: 'AA-SMOKE-C', request_id: 'smoke-cash-1' } });
  check('duplicate cash request_id is idempotent', [200, 201].includes(r.status) && r.json && r.json.duplicate === true, JSON.stringify(r.json));

  // Cash validation matrix
  const badCash = [
    { body: { full_name: 'V', email: 'v@example.com', amount: '0' }, expect: 400 },
    { body: { full_name: 'V', email: 'v@example.com', amount: '-50' }, expect: 400 },
    { body: { full_name: 'V', email: 'v@example.com', amount: 'abc' }, expect: 400 },
    { body: { full_name: 'V', email: 'v@example.com', amount: '1000000000' }, expect: 400 },
    { body: { full_name: 'V', email: 'not-an-email', amount: '100' }, expect: 400 },
    { body: { full_name: '', email: 'v@example.com', amount: '100' }, expect: 400 },
    { body: { full_name: 'V', email: 'v@example.com', amount: true }, expect: 400 }
  ];
  for (const t of badCash) {
    r = await api('POST', '/api/cash', { body: { ...t.body, request_id: 'smoke-cash-bad-' + Math.random().toString(36).slice(2) } });
    check('cash rejects invalid input -> ' + JSON.stringify(t.body), r.status === t.expect, r.status);
  }

  // Malformed JSON
  r = await fetch(BASE + '/api/cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  check('malformed JSON -> 400 invalid_json', r.status === 400, String(r.status));

  // Unknown API route
  r = await api('GET', '/api/does-not-exist');
  check('unknown /api route -> 404 JSON', r.status === 404 && r.json && r.json.error === 'not_found', JSON.stringify(r.json));

  // Static isolation
  for (const p of ['/index.js', '/db.js', '/package.json', '/render.yaml', '/.env', '/tests/e2e/gift-flow.spec.js']) {
    r = await api('GET', p);
    check('static isolation: ' + p + ' -> 404', r.status === 404, String(r.status));
  }
  r = await api('GET', '/');
  check('site root serves 200', r.status === 200, String(r.status));

  // Admin auth
  r = await api('GET', '/api/admin/gifts');
  check('admin gifts requires auth', r.status === 401, String(r.status));
  r = await api('POST', '/api/admin/login', { body: { password: 'wrong' } });
  check('admin login wrong password rejected', r.status === 401, String(r.status));
  r = await api('POST', '/api/admin/login', { body: { password: 'smoke-admin-pw' } });
  check('admin login succeeds', r.status === 200 && r.json && r.json.authenticated === true, JSON.stringify(r.json));
  const cookie = r.setCookie.split(';')[0];

  r = await api('GET', '/api/admin/gifts', { cookie });
  const giftsRows = r.json || [];
  const smokeGift = giftsRows.find((g) => g.email === 'smoke-gift@example.com');
  check('admin gifts shows claim with name/email/card/item', r.status === 200 && smokeGift &&
    smokeGift.guest_name === 'Smoke Gift' && smokeGift.email === 'smoke-gift@example.com' &&
    smokeGift.card_num === 'AA-SMOKE-1' && smokeGift.item_name === 'Inverter Refrigerator/Freezer', JSON.stringify(smokeGift));

  r = await api('GET', '/api/admin/payments', { cookie });
  const payRows = r.json || [];
  const smokePay = payRows.find((p) => p.email === 'smoke-cash@example.com');
  check('admin payments shows amount/card/verified', r.status === 200 && smokePay &&
    Number(smokePay.amount) === 75000 && smokePay.card_num === 'AA-SMOKE-C' && smokePay.verified === false, JSON.stringify(smokePay));

  r = await api('POST', '/api/admin/logout', { cookie });
  check('logout clears the auth cookie', /admin_token=;/.test(r.setCookie) || /admin_token=""/.test(r.setCookie) || r.setCookie.includes('admin_token=;'), r.setCookie);
  r = await api('GET', '/api/admin/check-auth');
  check('check-auth without cookie reports unauthenticated', r.status === 200 && r.json && r.json.authenticated === false, JSON.stringify(r.json));

  // Rate limiting (last: floods the /api/cash bucket on purpose)
  let saw429 = false;
  let okBefore = 0;
  for (let i = 0; i < 70; i++) {
    const rr = await api('POST', '/api/cash', { body: { full_name: 'Rl Tester', email: 'rl@example.com', amount: '100', request_id: 'smoke-rl-' + i } });
    if (rr.status === 429 && rr.json && rr.json.error === 'rate_limited') { saw429 = true; break; }
    if (rr.status === 201) okBefore++;
  }
  check('rate limiter returns 429 after burst', saw429 && okBefore >= 40, 'okBefore=' + okBefore + ' saw429=' + saw429);

  server.kill();
  console.log(`\nSMOKE RESULT: ${passed} passed, ${failed} failed (${usePg ? 'postgres' : 'sqlite'})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });