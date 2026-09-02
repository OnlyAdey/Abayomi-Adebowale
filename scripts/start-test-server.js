// Test-only server starter: resets the E2E SQLite database, then boots the app.
// Used by Playwright's webServer. Never used in production.
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'test-e2e.sqlite');
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  try { fs.rmSync(DB + suffix, { force: true }); } catch (_) { /* ignore */ }
}

process.env.SQLITE_PATH = DB;
process.env.PORT = '8020';
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'test-admin-pw';
process.env.SESSION_SECRET = 'test-session-secret';

require('../index.js');
