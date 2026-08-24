require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

// Serve static HTML files (index.html, admin.html) from your folder
app.use(express.static('.'));

// Test route to check if database works
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: "Database connected!", time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// Basic endpoints
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Initialize additional tables for payments and gifts if missing
async function initDb() {
  try {
    if (db.query) {
      await db.query(`CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        card_num TEXT,
        message TEXT,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      )`);

      await db.query(`CREATE TABLE IF NOT EXISTS gifts (
        id SERIAL PRIMARY KEY,
        guest_name TEXT NOT NULL,
        email TEXT,
        item_id TEXT,
        item_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      )`);
    } else {
      // sqlite
      await db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        card_num TEXT,
        message TEXT,
        verified BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS gifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guest_name TEXT NOT NULL,
        email TEXT,
        item_id TEXT,
        item_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    }
    console.log('DB init done');
  } catch (err) {
    console.error('DB init error', err);
  }
}

// Products
app.get('/api/products', async (req, res) => {
  try {
    if (db.query) {
      const r = await db.query('SELECT * FROM products ORDER BY id');
      return res.json(r.rows);
    }
    const rows = await db.all('SELECT * FROM products ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed' });
  }
});

// Register user (guest)
app.post('/api/register', async (req, res) => {
  const { full_name, email, address, phone } = req.body;
  if (!full_name || !email) return res.status(400).json({ error: 'name+email required' });
  try {
    if (db.query) {
      const r = await db.query('INSERT INTO users (full_name,email,address,phone) VALUES ($1,$2,$3,$4) RETURNING *', [full_name,email,address,phone]);
      return res.json(r.rows[0]);
    }
    const r = await db.run('INSERT INTO users (full_name,email,address,phone) VALUES (?,?,?,?)', [full_name,email,address,phone]);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [r.lastID]);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// Create an order and decrement stock atomically (best-effort across adapters)
app.post('/api/checkout', async (req, res) => {
  const { user_id, items, payment } = req.body; // items: [{product_id, qty}]
  if (!user_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'invalid payload' });
  }

  try {
    if (db.query) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const orderRes = await client.query('INSERT INTO orders (user_id, total_amount, paid) VALUES ($1,$2,$3) RETURNING *', [user_id, 0, false]);
        const order = orderRes.rows[0];
        let total = 0;
        for (const it of items) {
          const pid = it.product_id;
          const qty = parseInt(it.qty,10) || 1;
          const p = (await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [pid])).rows[0];
          if (!p || p.stock < qty) throw new Error('out_of_stock');
          await client.query('UPDATE products SET stock = stock - $1 WHERE id=$2', [qty, pid]);
          await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)', [order.id, pid, qty, p.price]);
          total += p.price * qty;
        }
        await client.query('UPDATE orders SET total_amount=$1 WHERE id=$2', [total, order.id]);
        // Simulate immediate payment success if payment.mock === true
        if (payment && payment.mock) {
          await client.query('UPDATE orders SET paid=true WHERE id=$1', [order.id]);
        }
        await client.query('COMMIT');
        res.json({ success: true, order_id: order.id, total });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('checkout err', err);
        if (err.message === 'out_of_stock') return res.status(409).json({ error: 'out_of_stock' });
        res.status(500).json({ error: 'checkout_failed' });
      } finally {
        client.release();
      }
    } else {
      // SQLite path: naive implementation with simple checks (no true transactions here)
      let total = 0;
      for (const it of items) {
        const p = await db.get('SELECT * FROM products WHERE id = ?', [it.product_id]);
        if (!p || p.stock < it.qty) return res.status(409).json({ error: 'out_of_stock' });
      }
      const r = await db.run('INSERT INTO orders (user_id,total_amount,paid) VALUES (?,?,?)', [user_id,0,false]);
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [r.lastID]);
      for (const it of items) {
        const p = await db.get('SELECT * FROM products WHERE id = ?', [it.product_id]);
        await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [it.qty, it.product_id]);
        await db.run('INSERT INTO order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)', [order.id, it.product_id, it.qty, p.price]);
        total += p.price * it.qty;
      }
      await db.run('UPDATE orders SET total_amount = ? WHERE id = ?', [total, order.id]);
      res.json({ success: true, order_id: order.id, total });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// Admin: simple protected endpoint - send X-ADMIN-PASS header
app.get('/api/admin/orders', async (req, res) => {
  const pass = req.headers['x-admin-pass'];
  if (!pass || pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (db.query) {
      const r = await db.query('SELECT o.*, u.full_name, u.email FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC');
      return res.json(r.rows);
    }
    const rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed' });
  }
});

// Record cash gift
app.post('/api/cash', async (req, res) => {
  const { full_name, email, amount, card_num, message } = req.body;
  if (!full_name || !email || !amount) return res.status(400).json({ error: 'required' });
  try {
    if (db.query) {
      const r = await db.query('INSERT INTO payments (full_name,email,amount,card_num,message,verified) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [full_name,email,amount,card_num||null,message||null,false]);
      return res.json(r.rows[0]);
    }
    const r = await db.run('INSERT INTO payments (full_name,email,amount,card_num,message,verified) VALUES (?,?,?,?,?,?)', [full_name,email,amount,card_num||null,message||null,0]);
    const p = await db.get('SELECT * FROM payments WHERE id = ?', [r.lastID]);
    res.json(p);
  } catch (err) {
    console.error('cash insert', err);
    res.status(500).json({ error: 'failed' });
  }
});

// Claim a physical gift
app.post('/api/gifts/claim', async (req, res) => {
  const { guest_name, email, item_id, item_name, card_num } = req.body;
  if (!guest_name || !email || !item_id) return res.status(400).json({ error: 'required' });
  try {
    if (db.query) {
      const r = await db.query('INSERT INTO gifts (guest_name,email,item_id,item_name) VALUES ($1,$2,$3,$4) RETURNING *', [guest_name,email,String(item_id),item_name||null]);
      return res.json(r.rows[0]);
    }
    const r = await db.run('INSERT INTO gifts (guest_name,email,item_id,item_name) VALUES (?,?,?,?)', [guest_name,email,String(item_id),item_name||null]);
    const g = await db.get('SELECT * FROM gifts WHERE id = ?', [r.lastID]);
    res.json(g);
  } catch (err) {
    console.error('gift insert', err);
    res.status(500).json({ error: 'failed' });
  }
});

// Admin: payments list
app.get('/api/admin/payments', async (req, res) => {
  const pass = req.headers['x-admin-pass'];
  if (!pass || pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (db.query) {
      const r = await db.query('SELECT * FROM payments ORDER BY created_at DESC');
      return res.json(r.rows);
    }
    const rows = await db.all('SELECT * FROM payments ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed' });
  }
});

// Admin: gifts list
app.get('/api/admin/gifts', async (req, res) => {
  const pass = req.headers['x-admin-pass'];
  if (!pass || pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (db.query) {
      const r = await db.query('SELECT * FROM gifts ORDER BY created_at DESC');
      return res.json(r.rows);
    }
    const rows = await db.all('SELECT * FROM gifts ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed' });
  }
});

// Ensure DB tables exist then start
initDb().then(() => {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log('Backend listening on', port));
}).catch(err => {
  console.error('Failed to init DB', err);
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log('Backend listening on', port));
});
