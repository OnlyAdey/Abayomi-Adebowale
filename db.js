// db.js - Unified database adapter (PostgreSQL or SQLite fallback).
//
// Exposes one async API so the rest of the app does not need to branch on the
// underlying database:
//   run(sql, params)            -> { lastID, changes, rows }
//   get(sql, params)            -> row | undefined
//   all(sql, params)            -> rows[]
//   withTransaction(async fn)   -> runs fn(tx) inside a transaction (tx = {run,get,all})
//   dialect                     -> 'pg' | 'sqlite'
//
// SQL may use "?" placeholders on both backends; they are converted to $1..$n
// for PostgreSQL automatically.
require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && !DATABASE_URL) {
  throw new Error('DATABASE_URL is required when NODE_ENV=production. Refusing to start with the SQLite fallback.');
}

function toPostgresSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function makePgQueries(executor) {
  return {
    run: async (sql, params = []) => {
      const r = await executor(toPostgresSql(sql), params);
      return { lastID: undefined, changes: r.rowCount || 0, rows: r.rows || [] };
    },
    get: async (sql, params = []) => {
      const r = await executor(toPostgresSql(sql), params);
      return r.rows[0];
    },
    all: async (sql, params = []) => {
      const r = await executor(toPostgresSql(sql), params);
      return r.rows || [];
    }
  };
}

let backend;

if (DATABASE_URL) {
  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const pool = new Pool({
    connectionString: DATABASE_URL,
    // SSL by default (Neon/Render-managed Postgres); PGSSLMODE=disable for local servers.
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: false },
    // Keep the pool small enough for managed free-tier plans; override with PGPOOL_MAX.
    max: Math.min(10, Number(process.env.PGPOOL_MAX) || 10)
  });

  const q = makePgQueries((sql, params) => pool.query(sql, params));

  backend = {
    dialect: 'pg',
    ...q,
    withTransaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = makePgQueries((sql, params) => client.query(sql, params));
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* already aborted */ }
        throw err;
      } finally {
        client.release();
      }
    }
  };
} else {
  const sqlite3 = require('sqlite3'); // lazy: the Postgres path never needs the native module
  const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'dev.sqlite');
  const db = new sqlite3.Database(SQLITE_PATH);
  db.configure('busyTimeout', 5000);

  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes, rows: [] });
    });
  });
  const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
  const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

  // The sqlite3 driver serializes individual statements, not whole transactions.
  // Serialize transactions with a promise chain so concurrent claims cannot
  // interleave BEGIN/COMMIT and trigger "cannot start a transaction within a transaction".
  let txChain = Promise.resolve();
  const withTransaction = (fn) => {
    const next = txChain.then(async () => {
      await run('BEGIN IMMEDIATE'); // write lock acquired up front
      try {
        const result = await fn({ run, get, all });
        await run('COMMIT');
        return result;
      } catch (err) {
        try { await run('ROLLBACK'); } catch (_) { /* no-op */ }
        throw err;
      }
    });
    txChain = next.catch(() => {});
    return next;
  };

  backend = {
    dialect: 'sqlite',
    run,
    get,
    all,
    withTransaction
  };
}

module.exports = backend;
