const { Pool } = require('pg');
const sqlite3 = require('sqlite3');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || '';

if (DATABASE_URL) {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect()
  };
} else {
  // Fallback to SQLite for local testing
  const dbFile = path.join(__dirname, 'dev.sqlite');
  const db = new sqlite3.Database(dbFile);

  function run(sql, params=[]) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  function all(sql, params=[]) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  function get(sql, params=[]) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  module.exports = { run, all, get };
}
