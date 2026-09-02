// Direct SQLite reader used by E2E tests to verify the actual database state.
const path = require('path');
const sqlite3 = require('sqlite3');

const DB = path.join(__dirname, '..', '..', '..', 'test-e2e.sqlite');
let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB);
    db.configure('busyTimeout', 10000);
  }
  return db;
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = { get, all, close, DB };
