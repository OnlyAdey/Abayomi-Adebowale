require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { validateCash, validateGiftClaim } = require('./validation');

const app = express();
app.set('trust proxy', 1); // behind Render/Neon proxies so req.ip reflects the client
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

// Minimal security headers (no new dependencies).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Only files in /public are served. Source, config and database files are never exposed.
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 8000;
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is required when NODE_ENV=production. Refusing to start with a generated password.');
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (() => {
  const temp = crypto.randomBytes(9).toString('base64url');
  console.warn(`[admin] ADMIN_PASSWORD is not set. A temporary password was generated for this session: ${temp}`);
  return temp;
})();
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_PASSWORD;
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('[admin] SESSION_SECRET is not set in production; defaulting to ADMIN_PASSWORD. Set a distinct value.');
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// Express 4 does not forward rejected promises; this wrapper does.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function isUniqueViolation(err) {
  if (err && (err.code === '23505')) return true; // Postgres unique_violation
  if (err && typeof err.code === 'number' && err.code === 19) return true; // SQLITE_CONSTRAINT
  if (err && String(err.code || '').startsWith('SQLITE_CONSTRAINT')) return true;
  return false;
}

function insertReturning(tx, table, sql, params) {
  if (db.dialect === 'pg') return tx.get(`${sql} RETURNING *`, params);
  return tx.run(sql, params).then((r) => tx.get(`SELECT * FROM ${table} WHERE id = ?`, [r.lastID]));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------------------------------------------------------------------------
// Simple in-memory fixed-window rate limiter (per client IP).
// Sufficient for a small wedding site; no external dependency.
// ---------------------------------------------------------------------------
const RATE_LIMITS = {
  '/api/gifts/claim': { windowMs: 60 * 1000, max: 60 },
  '/api/cash': { windowMs: 60 * 1000, max: 60 },
  '/api/admin/login': { windowMs: 15 * 60 * 1000, max: 20 }
};
const rateBuckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

function rateLimit(route) {
  return (req, res, next) => {
    const cfg = RATE_LIMITS[route];
    if (!cfg) return next();
    const bucketKey = route + ':' + (req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    let bucket = rateBuckets.get(bucketKey);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + cfg.windowMs };
      rateBuckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    if (bucket.count > cfg.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Gift catalog - single source of truth for gift availability and limits.
// Mirrors the registry rendered on the public page.
// ---------------------------------------------------------------------------
const GIFT_ITEMS = [
  { id: 'gift-1', name: 'Inverter Refrigerator/Freezer', max: 1 },
  { id: 'gift-2', name: 'Gas Cooker (4 Burner + Oven)', max: 1 },
  { id: 'gift-3', name: 'Microwave', max: 1 },
  { id: 'gift-4', name: 'Rechargeable Mist Fan or 1.5hp AC', max: 1 },
  { id: 'gift-5', name: 'Washing Machine (Fully Auto)', max: 1 },
  { id: 'gift-6', name: 'Rice Cooker', max: 1 },
  { id: 'gift-7', name: 'Toaster or Toaster Oven', max: 1 },
  { id: 'gift-8', name: 'Electric Iron + Ironing Board', max: 1 },
  { id: 'gift-9', name: 'Food Processor', max: 1 },
  { id: 'gift-10', name: 'Vacuum Cleaner', max: 1 },
  { id: 'gift-11', name: 'Water Heater/Geyser', max: 1 },
  { id: 'gift-12', name: 'Air Fryer', max: 1 },
  { id: 'gift-13', name: 'Digital Automatic Voltage Stabilizer', max: 1 },
  { id: 'gift-14', name: 'Multi Electric Juice Extractor', max: 1 },
  { id: 'gift-15', name: 'Hot plate', max: 1 },
  { id: 'gift-16', name: 'Pressure Pot', max: 1 },
  { id: 'gift-17', name: 'Nonstick Pot Set', max: 1 },
  { id: 'gift-18', name: 'DIY Glow in the Dark Wall Clocks 3D', max: 1 },
  { id: 'gift-19', name: 'Nonstick Frying Pan', max: 1 },
  { id: 'gift-20', name: 'Serving Tray', max: 3 },
  { id: 'gift-21', name: 'Duvet and bedding set', max: 3 },
  { id: 'gift-22', name: 'Grocery hamper', max: 6 }
];

// ---------------------------------------------------------------------------
// Database initialization - runs before the server starts listening.
// ---------------------------------------------------------------------------
async function ensureColumn(table, column, definition) {
  let existing;
  if (db.dialect === 'pg') {
    const rows = await db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?', [table]);
    existing = rows.map((r) => r.name);
  } else {
    existing = (await db.all(`PRAGMA table_info(${table})`)).map((r) => r.name);
  }
  if (!existing.includes(column)) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] added missing column ${table}.${column}`);
  }
}

async function initDb() {
  const isPg = db.dialect === 'pg';
  const TS = isPg ? 'TIMESTAMPTZ' : 'DATETIME';
  const SERIAL = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const NOW = isPg ? 'now()' : 'CURRENT_TIMESTAMP';
  const FALSE = isPg ? 'FALSE' : '0';

  await db.run(`CREATE TABLE IF NOT EXISTS gift_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_claims INTEGER NOT NULL CHECK (max_claims >= 1),
    sort_order INTEGER NOT NULL,
    created_at ${TS} DEFAULT ${NOW}
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS gifts (
    id ${SERIAL},
    guest_name TEXT NOT NULL,
    email TEXT NOT NULL,
    card_num TEXT,
    item_id TEXT NOT NULL REFERENCES gift_items(id),
    item_name TEXT NOT NULL,
    request_id TEXT,
    created_at ${TS} DEFAULT ${NOW}
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS payments (
    id ${SERIAL},
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    card_num TEXT,
    message TEXT,
    verified BOOLEAN DEFAULT ${FALSE},
    request_id TEXT,
    created_at ${TS} DEFAULT ${NOW}
  )`);

  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_gifts_request_id ON gifts (request_id)');
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_request_id ON payments (request_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_gifts_item_id ON gifts (item_id)');

  // Upgrade pre-existing tables created by the old schema.
  await ensureColumn('gifts', 'card_num', 'TEXT');
  await ensureColumn('gifts', 'request_id', 'TEXT');
  await ensureColumn('payments', 'request_id', 'TEXT');

  // Seed the catalog. ON CONFLICT DO NOTHING keeps existing rows (names/limits are not overwritten).
  for (let i = 0; i < GIFT_ITEMS.length; i++) {
    const g = GIFT_ITEMS[i];
    await db.run(
      'INSERT INTO gift_items (id, name, max_claims, sort_order) VALUES (?,?,?,?) ON CONFLICT (id) DO NOTHING',
      [g.id, g.name, g.max, i + 1]
    );
  }

  console.log(`[db] initialized (${db.dialect})`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Diagnostic DB check - never exposed in production.
if (process.env.NODE_ENV !== 'production') {
  app.get('/test-db', wrap(async (req, res) => {
    const row = await db.get('SELECT CURRENT_TIMESTAMP AS now');
    res.json({ message: 'Database connected!', time: row ? row.now : null });
  }));
}

// Gift catalog with live availability (source of truth for the registry badges).
app.get('/api/gifts', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT g.id, g.name, g.max_claims, g.sort_order, COUNT(c.id) AS claimed
    FROM gift_items g
    LEFT JOIN gifts c ON c.item_id = g.id
    GROUP BY g.id, g.name, g.max_claims, g.sort_order
    ORDER BY g.sort_order
  `);
  res.json(rows.map((r) => {
    const claimed = Number(r.claimed);
    const maxClaims = Number(r.max_claims);
    return {
      id: r.id,
      name: r.name,
      max_claims: maxClaims,
      sort_order: Number(r.sort_order),
      claimed,
      available: Math.max(0, maxClaims - claimed)
    };
  }));
}));

// Claim a physical gift. Availability is enforced inside a transaction.
app.post('/api/gifts/claim', rateLimit('/api/gifts/claim'), wrap(async (req, res) => {
  const input = req.body || {};
  const { errors, values } = validateGiftClaim(input);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  let outcome;
  try {
    outcome = await db.withTransaction(async (tx) => {
      const gift = await tx.get('SELECT * FROM gift_items WHERE id = ?', [values.item_id]);
      if (!gift) throw new HttpError(400, 'invalid_gift');

      // Idempotent retry: the same logical submission returns the same record.
      if (values.request_id) {
        const existing = await tx.get('SELECT * FROM gifts WHERE request_id = ?', [values.request_id]);
        if (existing) return { duplicate: true, claim: existing };
      }

      // Serialize concurrent claims on the same gift (Postgres row lock).
      if (db.dialect === 'pg') {
        await tx.get('SELECT id FROM gift_items WHERE id = ? FOR UPDATE', [values.item_id]);
      }

      const countRow = await tx.get('SELECT COUNT(*) AS n FROM gifts WHERE item_id = ?', [values.item_id]);
      const claimed = Number(countRow.n);
      if (claimed >= gift.max_claims) throw new HttpError(409, 'gift_unavailable');

      // Item name comes from the catalog, never from the browser.
      const row = await insertReturning(
        tx,
        'gifts',
        'INSERT INTO gifts (guest_name, email, card_num, item_id, item_name, request_id) VALUES (?,?,?,?,?,?)',
        [values.guest_name, values.email, values.card_num, gift.id, gift.name, values.request_id]
      );
      return { duplicate: false, claim: row };
    });
  } catch (err) {
    // Race on the same request_id: return the already-stored record.
    if (isUniqueViolation(err) && values.request_id) {
      const existing = await db.get('SELECT * FROM gifts WHERE request_id = ?', [values.request_id]);
      if (existing) return res.json({ duplicate: true, claim: existing });
    }
    throw err;
  }

  res.status(201).json(outcome);
}));

// Record a cash gift (transfer intent). Never auto-verifies.
app.post('/api/cash', rateLimit('/api/cash'), wrap(async (req, res) => {
  const input = req.body || {};
  const { errors, values } = validateCash(input);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  let outcome;
  try {
    outcome = await db.withTransaction(async (tx) => {
      if (values.request_id) {
        const existing = await tx.get('SELECT * FROM payments WHERE request_id = ?', [values.request_id]);
        if (existing) return { duplicate: true, payment: existing };
      }
      const row = await insertReturning(
        tx,
        'payments',
        'INSERT INTO payments (full_name, email, amount, card_num, message, request_id) VALUES (?,?,?,?,?,?)',
        [values.full_name, values.email, values.amount, values.card_num, values.message, values.request_id]
      );
      return { duplicate: false, payment: row };
    });
  } catch (err) {
    if (isUniqueViolation(err) && values.request_id) {
      const existing = await db.get('SELECT * FROM payments WHERE request_id = ?', [values.request_id]);
      if (existing) return res.json({ duplicate: true, payment: existing });
    }
    throw err;
  }

  const payment = outcome.payment;
  res.status(201).json({
    duplicate: outcome.duplicate,
    payment: {
      id: payment.id,
      full_name: payment.full_name,
      email: payment.email,
      amount: Number(payment.amount),
      card_num: payment.card_num || null,
      message: payment.message || null,
      verified: !!payment.verified,
      created_at: payment.created_at
    }
  });
}));

// ---------------------------------------------------------------------------
// Admin API - cookie-based session (httpOnly JWT). No public data exposure.
// ---------------------------------------------------------------------------
function isAdmin(req) {
  const token = req.cookies && req.cookies.admin_token;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    return payload && payload.role === 'admin';
  } catch (_) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.post('/api/admin/login', rateLimit('/api/admin/login'), (req, res) => {
  const password = req.body && req.body.password;
  if (typeof password !== 'string' || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const token = jwt.sign({ role: 'admin' }, SESSION_SECRET, { expiresIn: '12h' });
  res.cookie('admin_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/check-auth', (req, res) => {
  res.json({ authenticated: isAdmin(req) });
});

app.get('/api/admin/payments', requireAdmin, wrap(async (req, res) => {
  const rows = await db.all(
    'SELECT id, full_name, email, amount, card_num, message, verified, created_at FROM payments ORDER BY created_at DESC, id DESC'
  );
  res.json(rows.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    amount: Number(p.amount),
    card_num: p.card_num || null,
    message: p.message || null,
    verified: !!p.verified,
    created_at: p.created_at
  })));
}));

app.get('/api/admin/gifts', requireAdmin, wrap(async (req, res) => {
  const rows = await db.all(
    'SELECT id, guest_name, email, card_num, item_id, item_name, created_at FROM gifts ORDER BY created_at DESC, id DESC'
  );
  res.json(rows);
}));

// Unknown API routes return JSON 404 (never a page or a stack trace).
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// ---------------------------------------------------------------------------
// Central error handling
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code });
  }
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'server_error' });
});

// ---------------------------------------------------------------------------
// Start: initialize the database first, then listen on a single port.
// ---------------------------------------------------------------------------
initDb()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
    server.on('error', (err) => {
      console.error('[server] failed to start:', err.message);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('[server] database initialization failed:', err.message);
    process.exit(1);
  });
