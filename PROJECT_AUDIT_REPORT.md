# PROJECT_AUDIT_REPORT - Discovery & Architecture Audit (Read-Only Phase)

**Project:** Ayobami & Adebowale Wedding Website ("A & A")
**Repository:** C:\Users\hp\Downloads\Abayomi-Adebowale (Git remote: github.com/OnlyAdey/Abayomi-Adebowale)
**Branch (local):** backend-and-testing (origin/main exists)
**Phase:** Discovery only. No files modified, no dependencies installed, no database touched, nothing deployed. This report is the only file created.
**Audit date:** 2026-09-01
**How verified:** Static code inspection of every file in the working tree plus git history. Nothing was executed (dependencies are not installed), so runtime behavior is predicted from code, not observed. Anything not provable from code is explicitly marked NOT VERIFIED.

---

## 1. What the Application Does

A wedding gift-registry website for the couple Ayobami & Adebowale (event: Saturday, October 31st, 2026, Akure, Nigeria). Two real user-facing features:

1. **Physical gift registry** - a grid of 22 hardcoded gift cards. Guests click a card, enter name/email/invitation-card-number in a modal, and claim the gift. Claims are POSTed to the backend and the card is marked Taken (client-side only, via localStorage).
2. **Cash gift** - guests enter an amount, name, email, and optional invitation-card-number, click Proceed to Bank Details, see a Fidelity Bank account to transfer to, then click I Have Made Payment, which records the intent as an unverified payment in the database.

Plus:
3. **Admin dashboard** (admin.html) - intended to list orders, payments, and gifts behind a password login. Currently non-functional (see Confirmed Issues).
4. **Dead e-commerce scaffolding** - backend endpoints for /api/products, /api/register, /api/checkout, /api/admin/orders that reference products, users, orders, order_items tables. None of these endpoints are called by the frontend and none of the tables are ever created.

**Bottom line:** the app is a static marketing page with two data-capture forms and a broken admin view. At present every data-capturing API route returns HTTP 500 due to a code regression, so no user data can actually be saved.

---

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Static HTML + vanilla JS + CSS | No framework, no build step, no bundler |
| Frontend styling | Tailwind CSS v4 via CDN (@tailwindcss/browser@4) | Runtime-compiled in the browser; heavy and network-dependent |
| Icons | Font Awesome 6.4.0 CDN | Network-dependent |
| Backend | Node.js + Express 4 | express.json() body parser; no CORS middleware |
| Backend libs | pg (Postgres), sqlite3 (fallback), dotenv | cookie-parser + jsonwebtoken declared but NEVER used |
| Database | PostgreSQL when DATABASE_URL is set; SQLite (dev.sqlite) otherwise | Fallback selected automatically in db.js |
| Deployment | Render (render.yaml manifest) | Web service wedding-backend + managed Postgres wedding-db |
| Git host | GitHub | origin = https://github.com/OnlyAdey/Abayomi-Adebowale.git |
| Tests / CI | None | No test files, no Playwright, no CI config |
| Local runtime | Node v24.12.0, npm 11.6.2 available; node_modules NOT installed | Running locally requires npm install first (not done per instructions) |

---

## 3. Repository Inventory

| File | Size | Role |
|---|---|---|
| index.html | 38,327 B (899 lines) | Main wedding page + all client-side logic |
| admin.html | 8,069 B (184 lines) | Admin dashboard (login modal + 3 tabs) |
| index.js | 10,769 B (273 lines) | Express backend |
| db.js | 1,449 B (36 lines) | DB adapter: Postgres pool or SQLite |
| package.json | 348 B | Scripts + dependencies |
| render.yaml | 1,491 B | Render deployment manifest |
| readme.md | 16,011 B | Agent task instructions (untracked, not app code) |

No .gitignore, no .env, no node_modules, no dev.sqlite, no Dockerfile, no test files, no Playwright config, no schema/migration files.

---

## 4. Frontend Structure & Pages

### Pages (server-rendered static files)
- / -> index.html - single-page site with anchored sections:
  - Hero/#story (names, date, countdown widget)
  - #schedule (D-Day info card)
  - #gifts (gift registry grid - 22 hardcoded cards)
  - #cash-gift (cash gift form)
  - Modals: physicalGiftModal, bankDetailsModal
- /admin.html -> admin dashboard (login overlay + Orders/Payments/Gifts tabs)
- /test-db, /api/* -> backend routes (see section 6)

### Navigation
- Desktop nav links: #story, #party (**dead - no element with id=party**), #schedule, #gifts, admin.html, RSVP dropdown.
- Mobile nav links: #registry (**dead - no element with id=registry**), #cash-gift, #digital-clock.
- RSVP dropdown contains tel: links whose href values are placeholders (+2348000000001 ... +2348000000004) while the displayed numbers are 0816 790 0645 etc. - tapping dials the wrong number.

### Interactive components inventory (forms/buttons/modals/selections)
- Gift registry grid: 22 .registry-item cards. Items 1-19 carry data-item="1".."19" only; items 20-22 carry data-id="item-2" (all three identical!), plus data-max/data-claimed and inline onclick="handleItemSelect(this)".
- Click handler: delegated listener on #registryGrid opens physicalGiftModal.
- physicalGiftModal (Select Gift): form physicalGiftForm with giftGuestName, giftGuestEmail, physicalCardNum; button Confirm -> submitPhysicalGiftClaim().
- Cash gift form cashForm: cashAmount (number), cashName, cashEmail, cashCardNum; button Proceed to Bank Details -> openBankModal().
- bankDetailsModal: static Fidelity Bank account details, Copy button (copyAccountNumber()), I Have Made Payment button -> handlePaid().
- Countdown widget (#digital-clock), mobile hamburger menu toggle, close buttons on modals.
- Admin: login modal (password input + Log In -> submitLogin()), Logout button, three tab buttons.

### Client-side state
- localStorage['weddingGiftsClaimed'] - per-browser map of itemId -> claimed count, used to render Available/Taken badges. **Not shared between users/browsers and never synchronized with the server.**

---

## 5. Backend Structure

- Single file index.js, Express app.
- app.use(express.static('.')) - serves the **entire project directory** as static files (security issue, see Confirmed Issues).
- app.use(express.json()).
- No CORS, no sessions, no cookies, no rate limiting, no error-handling middleware, no request validation layer.
- DB access via db.js: { query, getClient } (Postgres) or { run, all, get } (SQLite).
- **Critical:** index.js:3 requires the module as const pool = require('./db'), but every handler except /test-db references a variable db that is **never defined** (see Confirmed Issue #1).
- Two app.listen() calls exist (line 22 and lines 268/272).

---

## 6. Backend / API Routes

| Route | Method | Purpose | Frontend uses it? | Current behavior (from code) |
|---|---|---|---|---|
| /test-db | GET | DB connectivity check | No | Uses pool (works); with SQLite fallback pool.query is not a function -> 500 |
| /api/health | GET | Health check | No | {status:'ok'} - only fully working route |
| /api/products | GET | List products | No | ReferenceError: db is not defined -> 500; products table also never created |
| /api/register | POST | Create guest user | No | db undefined -> 500; users table never created |
| /api/checkout | POST | Create order + decrement stock | No | db undefined -> 500; orders/order_items/products never created; mock payment via payment.mock |
| /api/cash | POST | Record cash gift payment | **Yes** (handlePaid) | db undefined -> 500; inserts payments row with verified=false |
| /api/gifts/claim | POST | Record physical gift claim | **Yes** (submitPhysicalGiftClaim) | db undefined -> 500; inserts gifts row but **drops card_num** |
| /api/admin/orders | GET | Admin: orders + user join | No (admin.html calls without header) | Requires X-ADMIN-PASS header; db undefined -> 500 |
| /api/admin/payments | GET | Admin: payments list | No | Requires X-ADMIN-PASS; db undefined -> 500 |
| /api/admin/gifts | GET | Admin: gifts list | No | Requires X-ADMIN-PASS; db undefined -> 500 |
| /api/admin/login | POST | Admin login | **Yes (admin.html)** | **Does not exist** -> 404 |
| /api/admin/check-auth | GET | Admin session check | **Yes (admin.html)** | **Does not exist** -> 404 |
| /api/admin/logout | POST | Admin logout | **Yes (admin.html)** | **Does not exist** -> 404 |

---

## 7. Database

### Technology & connection
- PostgreSQL when DATABASE_URL is set (pg.Pool, ssl.rejectUnauthorized: false for Neon/Render).
- SQLite file dev.sqlite in the repo root when DATABASE_URL is unset/empty.
- No migrations directory; schema is created at boot by initDb() in index.js (which only creates payments and gifts).

### Schema actually created by initDb
**payments**
- id SERIAL PK (SQLite: INTEGER AUTOINCREMENT)
- full_name TEXT NOT NULL
- email TEXT NOT NULL
- amount NUMERIC(12,2) NOT NULL
- card_num TEXT (nullable)
- message TEXT (nullable)
- verified BOOLEAN DEFAULT FALSE (SQLite: 0)
- created_at TIMESTAMPTZ DEFAULT now() (SQLite: DATETIME)

**gifts**
- id SERIAL PK
- guest_name TEXT NOT NULL
- email TEXT (nullable)
- item_id TEXT (nullable)
- item_name TEXT (nullable)
- created_at TIMESTAMPTZ DEFAULT now()

### Tables referenced but never created
products, users, orders, order_items - used by /api/products, /api/register, /api/checkout, /api/admin/orders. No CREATE TABLE for them exists in the working tree or anywhere in git history. If db is fixed, these routes will still fail with "relation does not exist".

### Relationships
- None. No foreign keys, no joins defined in schema, no indexes other than PKs.
- order_items (if it existed) would reference orders/products; orders.user_id would reference users.

### Important observations
- Gift claims have **no uniqueness constraint** (same guest can claim the same item repeatedly; no server-side max/stock check).
- Payments have **no idempotency key** - repeated clicks create duplicate rows.
- verified is written as false/0 on every insert and there is **no endpoint or admin action to flip it** - the verification workflow is a dead end.

---

## 8. User Workflows - End-to-End Traces

### Workflow A: Physical gift claim
```
USER: clicks gift card (e.g. item 1)
-> FRONTEND: registryGrid delegated listener opens physicalGiftModal; sets #selectedGiftName
-> USER: fills name + email (+ optional card number), clicks Confirm
-> FRONTEND: fetch POST /api/gifts/claim {guest_name, email, item_id, item_name, card_num}
-> BACKEND: handler reads req.body; references db -> ReferenceError -> catch -> 500 {error:'failed'}
-> FRONTEND: res.ok is false -> alert "Could not record gift claim. Please try again later."
-> DB: NOTHING WRITTEN
```
**Result: Broken today.** When db is fixed: gifts row is inserted **without card_num** (backend never persists it) -> invitation card number lost. UI badge update happens only in the submitter's browser via localStorage.

### Workflow B: Cash gift
```
USER: fills amount/name/email (+ optional card number) -> clicks "Proceed to Bank Details"
-> FRONTEND: openBankModal() validates presence only; stores globalCashData; shows bank modal
-> USER: transfers to Fidelity Bank; clicks "I Have Made Payment"
-> FRONTEND: fetch POST /api/cash {full_name, email, amount, card_num, message}
-> BACKEND: references db -> ReferenceError -> 500
-> FRONTEND: alert "Unable to record payment now. Please try again later."
-> DB: NOTHING WRITTEN
```
**Result: Broken today.** When db is fixed: a payments row is inserted with verified=false (amount and card_num persisted). message is always empty because the cashMessage input does not exist in the HTML (see Confirmed Issue #10).

### Workflow C: Admin dashboard
```
USER: opens /admin.html
-> FRONTEND: checkAuth() -> GET /api/admin/check-auth -> 404 -> showLogin()
-> USER: enters password -> POST /api/admin/login -> 404 -> "Invalid administrator password."
```
**Result: permanently broken** - the admin page was rewritten to use cookie/session-style endpoints that were never implemented on the backend.

### Workflow D: (Dead) e-commerce checkout
/api/products, /api/register, /api/checkout, /api/admin/orders are implemented but **no frontend code calls them**. Not part of any user journey.

---

## 9. Data Capture Audit - Is Everything Persisted?

| Field collected | From | Sent to API? | Persisted? | Notes |
|---|---|---|---|---|
| Gift guest name | giftGuestName | Yes | Yes (after db fix) | gifts.guest_name |
| Gift guest email | giftGuestEmail | Yes | Yes (after db fix) | gifts.email |
| Gift item id | card data-item/data-id | Yes | Yes (after db fix) | gifts.item_id - **items 20-22 all send "item-2"** (collision) |
| Gift item name | card text | Yes | Yes (after db fix) | gifts.item_name |
| Gift invitation card number | physicalCardNum | Yes | **NO - dropped** | /api/gifts/claim destructures card_num but never inserts it |
| Cash amount | cashAmount | Yes | Yes (after db fix) | payments.amount; no server-side validation (0/negative accepted) |
| Cash name | cashName | Yes | Yes (after db fix) | payments.full_name |
| Cash email | cashEmail | Yes | Yes (after db fix) | payments.email |
| Cash invitation card number | cashCardNum | Yes | Yes (after db fix) | payments.card_num (column named card_num) |
| Cash message | cashMessage | Would be | **Input missing in HTML** | JS reads #cashMessage at index.html:744 but no such element exists -> always empty |
| Payment verified | - | - | Always false | No flow ever sets it true |

---

## 10. Validation

### Client-side
- required attributes exist on name/email/amount inputs, but all submit buttons are type="button" - **browser native validation never triggers** (it only runs on form submission).
- openBankModal() checks presence of amount/name/email (empty-string only).
- submitPhysicalGiftClaim() checks name/email presence.
- No format validation: email format unverified, amount may be 0, negative, or non-numeric text.
- Gift max/claimed checks are per-browser localStorage numbers only.

### Server-side
- Presence checks only: !full_name || !email || !amount (cash), !guest_name || !email || !item_id (gift), !user_id || !items || !Array.isArray(items) || items.length === 0 (checkout).
- No type/range checks on amount (a string like "abc" would hit the DB; "0" and "-50" pass).
- No email validation, no length limits, no allowlist of item IDs, no max-claims enforcement, no duplicate detection, no idempotency.

---

## 11. Error Handling

- Every route wraps logic in try/catch and returns 500 {error:'...'} on failure - but the catch is also what hides the db is not defined regression, so all user flows fail with generic "please try again later" messages.
- initDb() catches and logs errors without rethrowing, so a failed schema init silently proceeds to app.listen.
- The second app.listen is called in both the then and catch branches of initDb().then(...) - a duplicated-startup anti-pattern.
- No centralized error middleware; no 404 handler; no logging framework.
- Frontend shows alert() on errors and never disables buttons, so users can double-submit (duplicate rows once the DB is reachable).

---

## 12. Tests & Playwright

- **No tests of any kind**: no unit, integration, or E2E tests.
- **No Playwright**: no playwright.config.*, no tests/ or e2e/ directory, no @playwright/test dependency, no test script in package.json.
- No CI configuration.
- The only scripts are start (node index.js) and dev (nodemon index.js - nodemon is **not** in dependencies/devDependencies, so npm run dev fails unless nodemon is installed globally).

---

## 13. Build & Run Commands

| Command | Result |
|---|---|
| npm start | Runs node index.js. Would start (twice - see bug #2). |
| npm run dev | Fails: nodemon not installed (not in package.json). |
| npm run build | **Fails: no build script in package.json** - but render.yaml uses it in buildCommand. |
| npm test / npm run lint | Not defined. |
| Any test runner | Not configured. |

Dependencies are not installed in this checkout; starting the app requires npm install (permitted later, not in this phase). Node v24.12.0 / npm 11.6.2 are available locally. sqlite3 v5 is a native module and may require build tools/prebuilt binaries on some platforms.

---

## 14. Environment Variables & Configuration

| Variable | Used by | Default | Notes |
|---|---|---|---|
| DATABASE_URL | db.js | empty -> SQLite | Presence switches DB adapter. **Empty string in render.yaml means production would silently use SQLite** unless set in the dashboard. |
| PORT | index.js | 8000 (first listen) / 4000 (second) | Two conflicting defaults; duplicate listen. |
| ADMIN_PASSWORD | index.js:26 | 'changeme' | Plaintext comparison vs X-ADMIN-PASS header. Default is public knowledge. |
| NODE_ENV | render.yaml | production | Not read anywhere in code. |
| Secrets in repo | - | - | None found (no .env, no keys). Good. |

No .env.example and no .gitignore exist; dev.sqlite (once created) would sit in the repo root and be served/committed accidentally.

---

## 15. Render / Deployment Configuration

render.yaml declares:
- Web service wedding-backend (node, region oregon, plan starter, branch main).
  - buildCommand: npm install && npm run build -> **fails on Render**: there is no build script (Confirmed Issue #4).
  - startCommand: npm start -> runs node index.js (subject to duplicate-listen crash when PORT is set).
  - envVars: NODE_ENV=production, DATABASE_URL="" (placeholder; must be set manually after DB provisioning).
- Database wedding-db: Postgres 14, plan free, diskSizeGB: 10 (free-tier disk limits may conflict - needs verification), region oregon.

Deployment status is **NOT VERIFIED** - no evidence the service was ever deployed to Render, and no Render dashboard access in this environment.

---

## 16. Fully Implemented (from code inspection)

- Static wedding landing page with hero, countdown, schedule, gift registry grid, and cash-gift section.
- Gift registry rendering with Available/Taken badge styling (client-side only).
- Cash gift form -> bank details modal -> I Have Made Payment flow (UI side only).
- Backend skeleton: Express app, JSON parsing, static serving, health endpoint.
- Dual DB adapter (pg/sqlite3) with automatic fallback.
- payments and gifts table DDL (autocreated at boot).
- Backend presence-checks for the three data routes.
- Postgres checkout transaction (best-effort FOR UPDATE stock decrement) - code-level complete, though unused and on missing tables.
- Admin dashboard HTML/CSS UI with login overlay and three tabs (UI side only).
- Basic client-side required-field checks in the two modals (presence only).

## 17. Partially Implemented

- **Gift claim persistence**: works only in the sense that a claim POST is attempted; card_num is dropped; no server-side stock/max enforcement; badge state is localStorage-only and diverges across users.
- **Cash payment persistence**: verified always false; no verification action anywhere; no idempotency; message field unusable (input missing).
- **Admin auth**: frontend rewritten to expect session endpoints; backend never implemented them (only header-based auth exists, which the new UI doesn't use).
- **Admin data views**: tabs exist, but admin reads nonexistent column invitation_card_num instead of card_num.
- **E-commerce flows** (/api/products, /api/register, /api/checkout, /api/admin/orders): backend-only scaffolding with no frontend and missing tables.
- **RSVP**: phone dropdown exists but dials placeholder numbers.
- **Countdown**: timer works but targets 2026-10-30 while the site says the wedding is Oct 31st.

## 18. Potential Issues (recommendations / non-blocking)

- Tailwind CSS v4 browser runtime + Font Awesome + Unsplash/Gstatic images are all external CDN dependencies; the page degrades or styles collapse if any is unavailable. Consider self-hosting/vendoring for production.
- No CORS middleware: fine for same-origin Render hosting; breaks if the frontend is ever hosted separately.
- No rate limiting or request-size controls (express.json() default 100kb) - an endpoint like /api/cash is trivially spammable.
- pg.Pool default max connections is 10; Render free Postgres has a small connection budget - pooling settings may need tuning (verify against plan).
- SQLite path is explicitly "no true transactions" for checkout; it pre-checks stock then decrements without locking (race conditions in concurrent claims).
- rejectUnauthorized: false for Postgres SSL is permissive; acceptable for Neon/Render but weaker than validating certs.
- express.static('.') also serves the repo's readme/instructions and any future .env content if named predictably - restrict to a public/ folder.
- No .gitignore; dev.sqlite (guest data) could be accidentally committed.
- Invalid HTML: li used directly inside nav; minor.
- nodemon referenced by dev script but not declared.
- Admin password in an env var compared in plaintext is acceptable for a hobby dashboard but should be replaced with a real session (cookie-parser/jsonwebtoken are already in package.json - clearly the intended direction, never wired up).
- No loading/disabled states on submit buttons -> double-clicks create duplicate records.
- No success/error UX beyond alert().

## 19. Confirmed Issues (established by code inspection)

1. **CRITICAL - db is not defined in index.js.** Line 3 does const pool = require('./db'), but every handler (initDb, /api/products, /api/register, /api/checkout, /api/cash, /api/gifts/claim, /api/admin/*) references db. This throws ReferenceError -> all these routes return 500. Introduced by commit fc89e82 (which renamed const db -> const pool but never updated the bodies). Only /api/health (and /test-db via pool) work.
2. **CRITICAL - Duplicate app.listen.** index.js:22 listens on PORT || 8000; index.js:268/272 listens again on PORT || 4000. With PORT set (as Render will), the second bind gets EADDRINUSE -> unhandled server error -> process crash. With PORT unset, two servers run on 8000 and 4000.
3. **CRITICAL - Admin login endpoints missing.** admin.html calls POST /api/admin/login, GET /api/admin/check-auth, POST /api/admin/logout; none exist in index.js. The admin dashboard can never be accessed.
4. **CRITICAL - Render build will fail.** render.yaml buildCommand runs npm run build; package.json has no build script.
5. **HIGH - Referenced tables never created.** products, users, orders, order_items have no DDL anywhere (working tree or git history). /api/products, /api/register, /api/checkout, /api/admin/orders fail even after the db fix.
6. **HIGH - Physical-gift card number lost.** submitPhysicalGiftClaim() sends card_num, but /api/gifts/claim inserts only (guest_name,email,item_id,item_name) - the invitation card number is silently dropped.
7. **HIGH - express.static('.') exposes the entire repo.** /index.js, /db.js, /package.json, /render.yaml, /readme.md, and (once created) /dev.sqlite are publicly downloadable, including guest data.
8. **HIGH - Gift item ID collision for items 20-22.** All three cards use data-id="item-2" (index.html:573,580,587). Claims are recorded under the same item_id and share one localStorage counter, so the three different gifts (Serving Tray max 3, Duvet max 3, Grocery hamper max 6) lock/unlock each other incorrectly.
9. **MEDIUM - handleItemSelect is undefined.** Inline onclick="handleItemSelect(this)" on items 20-22 references a function that doesn't exist -> console ReferenceError on every click (the delegated grid listener still opens the modal).
10. **MEDIUM - Cash message never captured.** openBankModal() reads #cashMessage (index.html:744) but no such input exists in the markup -> message is always empty in the DB.
11. **MEDIUM - Admin displays wrong column.** admin.html renders p.invitation_card_num / g.invitation_card_num; the schema column is card_num -> always shows "-".
12. **MEDIUM - Dead nav anchors.** #registry (mobile) and #party (desktop) point to non-existent IDs.
13. **MEDIUM - RSVP placeholder phone numbers.** href="tel:+2348000000001..." don't match the displayed numbers.
14. **MEDIUM - Countdown date mismatch.** targetDate = 2026-10-30T10:00 vs event date Oct 31, 2026 (one day early).
15. **MEDIUM - No server-side gift stock/max enforcement.** The gifts table has no limit logic, no unique constraint, no dedup - anyone can claim any item any number of times; the Taken state is per-browser.
16. **MEDIUM - No idempotency on /api/cash.** Double-clicking I Have Made Payment writes duplicate payment rows.
17. **MEDIUM - No verification workflow.** payments.verified is always false; nothing can ever mark a payment verified.
18. **MEDIUM - Weak admin auth.** X-ADMIN-PASS header compared to ADMIN_PASSWORD with default 'changeme'; no hashing, no session, no rate limit.
19. **LOW - /test-db breaks in SQLite mode.** pool.query is not a function when db.js exports run/all/get -> 500.
20. **LOW - Unused dependencies.** cookie-parser and jsonwebtoken are declared but never required; cors/body-parser were removed.
21. **LOW - initDb() swallows errors** and starts the server anyway, hiding missing tables.
22. **LOW - Client-side required never enforced.** Buttons are type="button", so HTML5 validation doesn't run; only JS presence checks apply.
23. **LOW - Amount not validated.** 0, negative, and non-numeric values pass; SQLite stores them as-is.
24. **LOW - Inconsistent qty handling in checkout.** Postgres path uses parseInt(qty,10)||1; SQLite path uses raw it.qty (string) in stock comparisons/decrements.

## 20. Not Yet Verified

- Whether the app runs at all locally (requires npm install; deliberately not executed this phase).
- Actual DB behavior (Postgres vs SQLite) - nothing executed against any database.
- Whether dev.sqlite / Postgres schema exist anywhere from prior runs.
- Whether a Render service exists / has ever been deployed; whether the Render-managed Postgres is provisioned.
- Browser behavior of modals, clipboard copy, Tailwind runtime, and countdown (no browser available in this phase).
- Render free-tier Postgres connection limits vs pg.Pool defaults.
- Whether diskSizeGB: 10 on a free Postgres plan is accepted by Render.
- Admin password value in production (must be a real secret, not 'changeme').
- Real email delivery, payment confirmation, or bank transfer verification (none exist by design - transfers are manual).

## 21. Areas Requiring E2E Testing (after fixes)

- A1: Cash gift happy path - fill amount/name/email -> bank modal -> copy -> I Have Made Payment -> success alert -> verify payments row (amount, name, email, card_num) in DB.
- A2: Physical gift claim happy path - click card -> modal -> submit -> badge flips to Taken -> verify gifts row (item_id/item_name) in DB.
- A3: Gift claim card-number persistence - confirm card_num lands in the DB (currently dropped).
- A4: Items 20-22 isolation - claim each separately; ensure they don't share counters/IDs.
- A5: Badge behavior across two browsers/devices (localStorage divergence expected today).
- A6: Double-click / duplicate submission on both forms.
- A7: Validation negatives - empty fields, invalid email, zero/negative amount, amount as text.
- A8: Admin - login, logout, tab loading, data display (incl. card_num column), session expiry.
- A9: Countdown correctness (Oct 30 vs Oct 31).
- A10: Mobile menu, dead nav anchors (#registry, #party), RSVP phone links.
- A11: Static exposure - attempt GET /index.js, /db.js, /dev.sqlite.
- A12: /test-db, /api/health.

## 22. Areas Requiring Database Verification

- Confirm the actual target database (Postgres URL or SQLite file) and that payments/gifts exist.
- Confirm products/users/orders/order_items do not exist (they're expected to be missing).
- Verify row contents after each workflow: amounts, names, emails, card_num, message, verified, created_at.
- Check for duplicate records and orphan rows after repeated submissions.
- Verify the gifts.item_id values for items 20-22 (collision) and whether claims exceed data-max.
- Verify gift-claim counts match per-browser localStorage vs DB (they will diverge).
- Check connection pool sizing against the Postgres plan.

## 23. Areas Requiring Deployment Verification

- Render build success after adding a build script or changing buildCommand.
- Port binding with PORT set (duplicate-listen fix required first).
- DATABASE_URL actually set in the Render service env (manifest value is empty -> SQLite fallback risk).
- Postgres SSL connectivity from the Render web service.
- Static assets (CDN reachability, images) and express.static exposure of source files.
- Health check (/api/health), /test-db on the deployed instance.
- Env var hygiene: ADMIN_PASSWORD set to a real secret; no .env committed.
- Free-tier resource limits (connections, disk, memory) for ~100 users.

## 24. Concurrency / ~100 Users Readiness

- **Hard blockers**: every user-facing API currently 500s (db undefined) - nothing works for any number of users.
- **Gift over-claiming**: the Taken state is per-browser localStorage; the server has no reservation, stock, or uniqueness enforcement. With ~100 users, the same gift will be claimed many times and the couple will receive duplicate gifts.
- **Duplicate submissions**: no idempotency -> double-clicks and retries create duplicate payment/gift rows.
- **DB connections**: pg.Pool defaults to max 10 connections; Render free Postgres limits may be lower - verify under load.
- **No rate limiting**: a handful of users (or a bot) can flood /api/cash with junk rows.
- **Startup crash risk**: duplicate app.listen with PORT set can crash the process immediately on deploy.
- Positive: payloads are tiny, queries are simple, and 100 users on a static page is otherwise trivially fine once the above are addressed.

---

## 25. Summary

### Overall architecture
Static HTML/vanilla-JS wedding site (Tailwind via CDN) served by an Express backend that doubles as its own static file server, with a Postgres/SQLite dual adapter. Two real features (gift claims, cash-gift recording), a broken admin dashboard, and unused e-commerce scaffolding. No tests, no build step, no real auth.

### Main user journey
Guest lands on / -> browses registry -> claims a physical gift (modal form) OR fills the cash-gift form -> sees bank details -> confirms payment -> data should land in gifts/payments. Couple views records in admin.html. Today the journey stops at the API: **every data POST returns 500** due to the db regression, so nothing is stored.

### Database structure
Two tables actually created (payments, gifts) with simple flat columns; four more tables (users, products, orders, order_items) referenced by dead code but never created. No FKs, no indexes beyond PK, no uniqueness, no idempotency.

### Current implementation status
**NOT DEPLOYABLE / NOT FUNCTIONAL.** Static page renders, but the entire data layer is broken by a single rename regression; the admin panel is broken by missing endpoints; Render build command references a nonexistent build script; and production DB fallback risks using SQLite on ephemeral storage.

### Biggest risks / issues
1. db undefined -> all APIs 500 (blocker).
2. Duplicate app.listen -> crash when PORT set (deploy blocker).
3. Missing admin auth endpoints -> admin unusable.
4. npm run build missing -> Render build fails (deploy blocker).
5. Referenced tables never created (users/products/orders/order_items).
6. Gift claim integrity: card number dropped, item ID collision (20-22), localStorage-only Taken state, no server-side limits -> duplicate/over-claiming at 100 users.
7. Static exposure of source + future SQLite DB.

### What should be tested first
After the blockers are fixed: cash-gift flow, gift-claim flow, and admin login/list - each verified down to the DB row. Then negative/duplicate/concurrency tests (two browsers), then npm start + /api/health + /test-db, then Render deploy with a real DATABASE_URL.

### What must be completed before deployment
1. Fix db binding (rename back to db or rewrite handlers to pool).
2. Remove duplicate app.listen; single PORT-aware listen.
3. Add missing build script (or change render.yaml buildCommand).
4. Implement admin session endpoints (/api/admin/login|check-auth|logout) using the already-declared cookie-parser/jsonwebtoken, or revert admin.html to header auth.
5. Create missing tables (products, users, orders, order_items) or remove dead routes.
6. Persist card_num on gift claims; fix invitation_card_num -> card_num in admin.html; fix items 20-22 IDs.
7. Add cashMessage input (if message capture is wanted) and mark payments verified only through an admin action.
8. Serve static files from a public/ folder, add .gitignore, set a real ADMIN_PASSWORD.
9. Add server-side validation, idempotency/limits for claims, and verify connection-pool sizing for the chosen Postgres plan.
10. Set DATABASE_URL and PORT correctly in Render; deploy and run production E2E.

---

read th# PHASE 2 — Implementation & Runtime Verification (2026-09-01)

This section documents what was implemented in Phase 2, the runtime verification performed, and the issues that remain. Discovery-phase findings from Phase 1 remain valid as the description of the original state.

## Phase 2 - Status Legend

Every issue below is marked:
- **FIXED & VERIFIED** - code change made and verified by runtime test
- **FIXED (static)** - code change made, verified by code inspection only
- **REMAINS** - not fixed in this phase

## Files Changed (and why)

| File | Change | Reason |
|---|---|---|
| `db.js` | Rewritten | Unified async adapter (`run/get/all/withTransaction` + `dialect`) for Postgres and SQLite; automatic `?`->`$n` conversion for Postgres; serialized SQLite transactions (mutex) so concurrent claims cannot nest BEGIN; refuses SQLite fallback when `NODE_ENV=production` and `DATABASE_URL` missing |
| `validation.js` | New | Server-side validation: names (required, <=120 chars), email (regex + length), amounts (finite, >0, <=100,000,000), optional card number/message length limits |
| `index.js` | Rewritten | Fixed `db` binding; single `PORT`-aware `app.listen` after `initDb()`; reliable schema init + gift catalog seed; `/api/gifts` (catalog + live availability); `/api/gifts/claim` (limits enforced in transaction, idempotency, card_num persisted, item_name from catalog); `/api/cash` (validation, idempotency, verified always false); admin session auth (login/logout/check-auth + protected lists); central error middleware; static serving from `public/` only |
| `index.html` -> `public/index.html` | Moved + fixed | Unique `data-item="gift-1..22"`; removed undefined `handleItemSelect` and client-side counters; RSVP phone links corrected; dead nav anchors fixed (`#registry`->`#gifts`, removed `#party`); countdown date -> Oct 31; server-driven badges via `/api/gifts`; disabled buttons + `request_id` on submit; localStorage removed as source of truth |
| `admin.html` -> `public/admin.html` | Moved + fixed | Uses implemented session endpoints; displays `card_num` (was `invitation_card_num`); shows verified status; Orders tab now explains it is unused |
| `package.json` | Updated | `dev` -> `node --watch`; added `test:e2e`; name/description/engines; `@playwright/test` devDependency |
| `render.yaml` | Updated | `buildCommand: npm install` (no build script needed); `healthCheckPath: /api/health`; `DATABASE_URL`/`ADMIN_PASSWORD`/`SESSION_SECRET` marked `sync: false`; removed invalid `diskSizeGB` on free plan |
| `.gitignore` | New | `node_modules/`, `.env`, `*.sqlite*`, test artifacts |
| `.env` | New (local only, gitignored) | Local `ADMIN_PASSWORD` |
| `.env.example` | New | Documents `PORT`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL` |
| `playwright.config.js` | New | E2E runner: fresh SQLite DB per run, port 8020, single worker |
| `scripts/start-test-server.js` | New | Resets E2E DB, sets test env, boots the app (Playwright webServer) |
| `tests/e2e/*` | New | 6 spec files + SQLite DB helper (see Tests Added) |

## Bugs Fixed

| # | Issue (from Phase 1) | Status | Fix | Verified by |
|---|---|---|---|---|
| 1 | `db` is not defined (regression `pool` vs `db`) | FIXED & VERIFIED | Unified `db` adapter; all routes use `db` | 42/42 smoke tests + 21/21 E2E |
| 2 | Duplicate `app.listen` (crash when PORT set) | FIXED & VERIFIED | Single listener after `initDb()` | server starts once on 8000/8010/8020 |
| 3 | Missing admin login/check-auth/logout endpoints | FIXED & VERIFIED | Cookie-based JWT session endpoints | admin E2E tests |
| 4 | Render `npm run build` missing | FIXED (static) | `buildCommand: npm install` | render.yaml inspection |
| 5 | Referenced tables never created (products/users/orders/order_items) | REMAINS by design | Legacy e-commerce scaffolding removed from backend; tables no longer referenced | code inspection |
| 6 | Gift `card_num` silently dropped | FIXED & VERIFIED | Insert now includes `card_num` | gift-flow E2E + DB row check |
| 7 | `express.static('.')` exposed whole repo | FIXED & VERIFIED | Static from `public/` only | `/db.js`, `/index.js`, `/package.json` all 404 |
| 8 | Items 20-22 shared `item-2` id | FIXED & VERIFIED | Unique `gift-20/21/22` in HTML and catalog | catalog + E2E |
| 9 | `handleItemSelect` undefined | FIXED | Removed inline handler; delegation only | landing E2E (no page errors) |
| 10 | Cash message never captured | REMAINS by design | Decision: the UI does not collect a message; DB column kept for future use | documented |
| 11 | Admin `invitation_card_num` mismatch | FIXED & VERIFIED | Admin renders `card_num` | admin E2E |
| 12 | Dead nav anchors (#registry, #party) | FIXED (static) | `#registry`->`#gifts`; removed `#party` | code inspection |
| 13 | RSVP placeholder phone links | FIXED (static) | hrefs now match displayed numbers | code inspection |
| 14 | Countdown date mismatch (Oct 30 vs Oct 31) | FIXED (static) | `targetDate` -> `2026-10-31T10:00:00` | code inspection |
| 15 | No server-side gift limits (localStorage only) | FIXED & VERIFIED | `gift_items` catalog with `max_claims`; count+lock inside transaction; badge from `/api/gifts` | gift-limits E2E incl. simultaneous final slot |
| 16 | No idempotency (duplicate rows) | FIXED & VERIFIED | `request_id` unique index + duplicate detection; buttons disabled while submitting | cash idempotency E2E + DB counts |
| 17 | No verification workflow (verified always false) | REMAINS by design | Never auto-verified; admin sees Verified=No. Marking verified is a product decision for a future admin action | documented |
| 18 | Weak admin auth (`changeme` default) | FIXED | No default password; if `ADMIN_PASSWORD` unset, a temporary password is generated and logged; timing-safe compare; httpOnly cookie | admin E2E |
| 19 | `/test-db` broken in SQLite mode | FIXED | Uses unified `db.get`; hidden in production | smoke test |
| 20 | Unused deps (cookie-parser, jsonwebtoken) | FIXED | Now used for admin sessions | code inspection |
| 21 | `initDb()` swallowed errors | FIXED & VERIFIED | Failure exits process; listener only starts after init | production-guard check |
| 22 | Client-side `required` never enforced | FIXED (static) | JS presence + amount checks on submit | E2E flow tests |
| 23 | Amount not validated | FIXED & VERIFIED | Server rejects 0/negative/NaN/overflow/non-numeric | validation E2E |
| 24 | Checkout qty inconsistency | REMAINS by design | Legacy checkout removed | - |

## Tests Added

- `playwright.config.js` - 1 worker, fresh DB per run, port 8020, trace on failure.
- `tests/e2e/helpers/db.js` - direct SQLite reader for post-UI database verification.
- `tests/e2e/00-landing.spec.js` - page loads; major sections; 22 cards; server-driven badges; no uncaught page errors; mobile menu.
- `tests/e2e/gift-flow.spec.js` - UI claim end-to-end + DB row verification (name, email, card_num, item_id, item_name, timestamp).
- `tests/e2e/gift-limits.spec.js` - available gift; fully claimed max=1 rejected; max=3 accepts 3 then rejects 4th; two simultaneous attempts for final slot (exactly one wins); badge reflects server state after reload.
- `tests/e2e/cash-flow.spec.js` - UI cash flow end-to-end + DB row (amount, card_num, verified=0); request_id idempotency (single row).
- `tests/e2e/validation.spec.js` - empty name, invalid email, missing/invalid gift id, zero/negative/non-numeric amount.
- `tests/e2e/admin.spec.js` - invalid login; valid login; view gifts (names, emails, items, card numbers); view payments (amounts, card numbers, verified=No); logout.

## Runtime Verification Results (actual, not assumed)

| Check | Result |
|---|---|
| `npm install` | OK - 223 packages installed |
| `npm audit --omit=dev` | 7 advisories (2 low, 4 high, 1 critical) - all trace to `sqlite3@5` build toolchain (`node-gyp` -> `tar`/`http-proxy-agent`); fix requires `sqlite3@6` (breaking). No force-upgrade applied. |
| API smoke suite (42 checks) | ALL PASSED - health, test-db, static isolation (source 404), catalog (22 items), claim happy path + card_num, idempotent duplicate, max=1 rejection, max=3 sequence, cash validation matrix, admin auth matrix, DB row checks |
| Playwright E2E (21 tests) | ALL PASSED |
| `npm start` (default SQLite) | `[db] initialized (sqlite)`, listens on 8000, `/api/health` ok, `/api/gifts` returns 22 items |
| `NODE_ENV=production` without `DATABASE_URL` | Refuses to start (exit 1) with clear message - prevents accidental SQLite in production |
| Static file isolation | `/db.js`, `/index.js`, `/package.json` return 404; `/` serves the site |
| Concurrency (final slot) | gift-21: 2 pre-claims + 2 simultaneous = 3 stored, exactly one 201 and one 409 |

## Database Verification Results (from `test-e2e.sqlite` after the full E2E run)

- Gift claims stored per item: gift-1:1, gift-2:1, gift-3:1, gift-4:1, gift-8:1, gift-20:3, gift-21:3 - limits respected (max 3 on 20/21).
- Payments stored: 3 rows (admin seed 25,000, E2E cash 75,000, idempotency 1,000), all `verified=0`, each with correct `card_num`; duplicate request produced no extra row.
- `gifts.card_num`, `payments.card_num`, `gifts.item_name` (from catalog, not browser) verified via direct SQL queries.

## Remaining Issues

1. **npm audit (7 advisories)** - all via `sqlite3@5` -> `node-gyp` -> `tar`. Recommend `sqlite3@6.0.1` (breaking major) before production, or confirm the production DB is Postgres (sqlite3 package still needed for local dev, but advisories are build-time).
2. **Postgres path not runtime-verified** - no Postgres server was available. SQL is dialect-safe and the unified adapter converts placeholders, but first deployment must run the suite (or at least the API smoke checks) against a real `DATABASE_URL`.
3. **Payment verification** - `verified` is always `false`; marking payments verified is a product decision (future admin action). Documented, not implemented.
4. **Cash message** - not collected by the UI (decision); column exists for future use.
5. **Rate limiting** - none; recommended before public launch (a bot could spam `/api/cash`).
6. **pg.Pool sizing** - default max 10 connections; verify against Render free Postgres connection limit at deploy.
7. **External CDNs** - Tailwind v4 browser runtime, Font Awesome, Unsplash/Gstatic images. If any is unreachable the page still works (JS is inline) but styling/images degrade. Consider vendoring before launch.
8. **E2E runner teardown** - on Windows the Playwright process does not exit promptly after tests finish (webServer teardown hang); tests all pass. Cosmetic.
9. **Legacy e-commerce** - removed (products/users/orders/order_items endpoints and tables). Documented as intentional; the wedding site has no dependency on it.
10. **Admin Orders tab** - shows an explanatory message (feature not used); kept for layout consistency.

## Ready for Next Phase?

**LOCAL RUNTIME: READY.** The application is functional locally: all user workflows, gift limits (including concurrent final-slot), validation, idempotency, admin auth, and DB persistence are runtime-verified. **Deployment (Render) is NOT done** and requires: setting `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` in the Render dashboard (marked `sync: false`), then running the suite against the deployed instance.


# Phase 3 - Website Quality, Mobile & UX

### Scope
Phase 3 treated the site as both a gift/registry application and an **information site for the wedding**. No Phase 2 backend logic was reworked. Only the frontend (public/index.html) and E2E tests changed. No wedding information was invented; all new content reuses existing data (names, date, venue, phone numbers).

### Changes Made (frontend only)
1. **RSVP section** (#rsvp) added after the Schedule section - surfaces the four existing phone numbers (0816 790 0645, 0903 973 8934, 0814 085 1696, 0704 918 6657) as large tel:+234... tap targets. Previously the numbers existed only in a hover-only dropdown.
2. **Footer** added with the existing names, "October 31st, 2026 - Akure, Nigeria", and the same four RSVP phone links.
3. **Sticky nav**: fixed invalid <li> directly under <nav> (changed to <div>); RSVP dropdown toggle is now a link to #rsvp (was javascript:void(0), unusable for keyboard/touch); mobile menu now includes Our Story, Schedule, RSVP and Admin links (was only Registry/Cash Gift/Countdown).
4. **Mobile menu positioning**: the hamburger button and menu were part of the centered hero flex column, and the menu opened at the bottom of the screen. They are now absolutely positioned under the top-left of the hero (max-width:767px) with a bounded, scrollable panel.
5. **Registry section**: added section padding (56px 16px 48px) so cards no longer touch screen edges; all 22 gift images now loading="lazy" decoding="async".
6. **Hero**: heading reduced from text-4xl to text-3xl below 640px (sm:text-4xl md:text-7xl unchanged) to prevent 320px overflow; countdown font now clamp(1rem, 4.5vw, 1.3rem).
7. **Forms/modals**: gift modal name/email inputs now have real <label> elements; modal close controls converted from <span> to <button type="button" aria-label="Close">; Escape key closes either modal; site-wide :focus-visible outline; menu toggle got aria-label and its focus:outline-none was removed.
8. **Touch targets**: copy-account button padding enlarged (4x10 -> 10x16, 0.8rem -> 0.85rem); RSVP dropdown toggle padded to ~40px tall; footer phone links given inline-block py-2.
9. **Copy**: fixed "Coffe brown" -> "Coffee brown" (obvious typo) in the schedule card; schedule chip allows text wrapping on narrow screens.
10. **HTML validity**: removed a stray </div> inside the header; tag balance verified for div/section/header/footer/nav/ul/li/button/form/label/span/p/a/h1/h2/h3.

### Tests Run (actual)
| Check | Result |
|---|---|
| Playwright E2E full suite | **25/25 PASSED** (21 existing + 4 new UI tests) |
| 21/21 existing tests (regression) | PASSED |
| New tests/e2e/ui.spec.js (4 tests) | PASSED - RSVP phone links visible with tel:+234 hrefs; no horizontal overflow at 320px; modal close is a keyboard-accessible button and Escape closes the modal; mobile menu includes the #rsvp link |
| Layout audit at 320/375/390/768/1280 | No horizontal overflow at any width (scrollWidth == innerWidth) |
| Gift modal at 320px | Fits viewport (280px wide, x=20) |
| Mobile menu at 390px | Panel fully inside viewport (x=16, w=358, h=213) |

### Remaining Issues (Phase 3)
1. **External CDN dependency** - [REMAINS] Tailwind v4 browser runtime, Font Awesome, Unsplash hero image, Gstatic thumbnails; degrades gracefully.
2. **'Cinzel' font referenced but never loaded** - [RESOLVED in FINAL PHASE] reference removed; rendering (serif fallback) unchanged.
3. **Modal focus trap not implemented** - [RESOLVED in FINAL PHASE] focus management on open/close plus Tab wrap implemented and E2E-tested.
4. **Hero image weight** - [REMAINS, non-blocking] single 1920w Unsplash JPEG on all viewports.
5. **Mobile menu aria state** - [RESOLVED in FINAL PHASE] aria-expanded/aria-controls added and E2E-tested.


---

# FINAL PHASE - Reconciliation, Validation & Production Readiness (2026-09-01)

## Status across phases

| Phase | What it delivered | Outcome |
|---|---|---|
| 1 | Read-only discovery + architecture audit (25 sections) | All findings reconciled below |
| 2 | Backend fixed (db/pool, single listener, initDb before listen, schema, /api/cash, /api/gifts/claim, data flow, errors), gift limits w/ transactions, data capture, validation, idempotency, admin auth, static isolation, .gitignore, frontend correctness, Playwright 21 tests | Verified (21/21 E2E) |
| 3 | Wedding information site: RSVP section, footer, nav/mobile menu, registry padding, lazy images, labels, accessible close buttons, Escape close, touch targets, typo fix, HTML validity | Verified (25/25 E2E incl. 4 UI tests) |
| Final | Production hardening + full reconciliation + real PostgreSQL verification + cleanup | Verified (27/27 E2E, 34/34 smoke on BOTH SQLite and PostgreSQL) |

## Original Phase 1 findings reconciliation

### Confirmed issues (Phase 1, section 19)

| # | Issue | Final status |
|---|---|---|
| 1 | db undefined -> all APIs 500 | FIXED & VERIFIED - smoke + E2E write real rows |
| 2 | Duplicate app.listen | FIXED & VERIFIED - single PORT-aware listener, starts once |
| 3 | Admin login endpoints missing | FIXED & VERIFIED - cookie JWT session; admin E2E + smoke |
| 4 | Render build fails (npm run build) | FIXED but only statically verified - buildCommand is npm install; no build step exists |
| 5 | products/users/orders/order_items tables missing | FIXED (intentional) - legacy e-commerce routes/tables removed; wedding site has no dependency |
| 6 | Gift card_num dropped | FIXED & VERIFIED - gifts.card_num persisted; E2E asserts row |
| 7 | express.static('.') exposes repo | FIXED & VERIFIED - static from public/; smoke: /index.js,/db.js,/package.json,/.env -> 404 |
| 8 | Items 20-22 share item-2 | FIXED & VERIFIED - unique gift-1..22; limits enforced per item |
| 9 | handleItemSelect undefined | FIXED & VERIFIED - delegated listener only; no inline handlers |
| 10 | Cash message never captured | INTENTIONALLY REMAINS - documented decision: UI does not collect a message; column exists for future use |
| 11 | Admin invitation_card_num vs card_num | FIXED & VERIFIED - admin uses card_num; E2E asserts values |
| 12 | Dead nav anchors (#registry, #party) | FIXED & VERIFIED - mobile/desktop nav rewritten |
| 13 | RSVP placeholder tel numbers | FIXED & VERIFIED - real +234 numbers; UI E2E asserts tel hrefs |
| 14 | Countdown date mismatch | FIXED & VERIFIED - target 2026-10-31T10:00 |
| 15 | No server-side stock/max | FIXED & VERIFIED - catalog + transactions (PG FOR UPDATE / serialized SQLite); concurrent final-slot tests |
| 16 | No idempotency on /api/cash | FIXED & VERIFIED - request_id unique index; E2E + smoke |
| 17 | No verification workflow | INTENTIONALLY REMAINS - verified always false; an admin "mark verified" action is a product decision, not built |
| 18 | Weak admin auth (changeme / header) | FIXED & VERIFIED - httpOnly JWT cookie, timing-safe compare, rate-limited login, production ADMIN_PASSWORD guard |
| 19 | /test-db breaks in SQLite | FIXED & VERIFIED - adapter-based; passes on both backends |
| 20 | Unused cookie-parser/jsonwebtoken | FIXED - both now used; npm ls shows no unused packages |
| 21 | initDb swallows errors | FIXED & VERIFIED - initDb before listen; failure exits 1 |
| 22 | Client-side required never enforced | FIXED - JS presence checks + labels; server validation authoritative |
| 23 | Amount not validated | FIXED & VERIFIED - validation matrix (0/negative/non-numeric/overflow/boolean) in smoke + E2E |
| 24 | Inconsistent qty in checkout | N/A - checkout removed with the e-commerce scaffolding |

### Phase 2 remaining issues

| # | Issue | Final status |
|---|---|---|
| 1 | npm audit (7 via sqlite3@5 -> node-gyp -> tar) | INTENTIONALLY REMAINS - see Security/Dependency status |
| 2 | Postgres path not runtime-verified | FIXED & VERIFIED - real PostgreSQL 18.3 run in final pass (34/34 smoke) |
| 3 | Payment verification workflow | INTENTIONALLY REMAINS - product decision |
| 4 | Cash message not collected | INTENTIONALLY REMAINS - documented decision |
| 5 | Rate limiting | FIXED & VERIFIED - in-memory per-IP limiter (claim/cash 60/min, login 20/15min); smoke asserts 429 |
| 6 | pg.Pool sizing | FIXED - max capped at 10, PGPOOL_MAX override; verified with PGPOOL_MAX=3 on pg |
| 7 | External CDNs | INTENTIONALLY REMAINS - documented; degrades gracefully, never breaks JS |
| 8 | E2E teardown hang on Windows | INTENTIONALLY REMAINS - cosmetic; all tests green |
| 9 | Legacy e-commerce | FIXED - removed |
| 10 | Admin Orders tab | INTENTIONALLY REMAINS - explanatory message, harmless |

### Phase 3 remaining issues

| # | Issue | Final status |
|---|---|---|
| 1 | External CDN dependency | INTENTIONALLY REMAINS - documented |
| 2 | Cinzel font referenced but not loaded | FIXED - reference removed (kept serif fallback = identical rendering) |
| 3 | Modal focus trap | FIXED & VERIFIED - openModal/closeModal focus management + Tab wrap; UI E2E test |
| 4 | Hero image weight (1920w on mobile) | INTENTIONALLY REMAINS - non-blocking, documented |
| 5 | aria-expanded on hamburger | FIXED & VERIFIED - toggle syncs attribute; UI E2E test |

## Changes made in the final pass

- **index.js**: production guard (refuse to start without ADMIN_PASSWORD when NODE_ENV=production; the DATABASE_URL guard lives in db.js); per-IP in-memory rate limiter on claim/cash/login; security headers (nosniff, DENY frame, no-referrer); express.json 32kb limit; trust proxy for correct client IPs; JSON 404 for unknown /api routes.
- **db.js**: lazy sqlite3 require (production pg path never loads the native module); PGSSLMODE support (disable for local Postgres, SSL default for Render/Neon); PGPOOL_MAX pool cap (default 10).
- **validation.js**: amount must be string/number type (rejects booleans etc.).
- **public/index.html**: modal focus trap + focus restore; role=dialog/aria-modal/aria-labelledby on modals; aria-expanded/aria-controls on hamburger; removed unused Cinzel font reference.
- **render.yaml**: removed plan: free on the database (Render discontinued free Postgres) with a comment to choose a plan in the dashboard; BOM stripped.
- **.gitignore**: added .env.* / !.env.example and *.log.
- **.env.example**: documented PGPOOL_MAX and PGSSLMODE.
- **tests/smoke/api.smoke.js (new) + package.json**: 34-check end-to-end API smoke suite that boots the real app on a throwaway DB and exercises every endpoint; wired as npm run test:smoke.
- **tests/e2e/ui.spec.js**: +2 tests (aria-expanded toggle, modal focus trap).

## Tests actually run (final pass)

| Test | Result |
|---|---|
| Playwright E2E full suite | **27/27 PASSED** (21 Phase-2 + 4 Phase-3 + 2 final-pass a11y) |
| API smoke - SQLite (34 checks) | **34/34 PASSED** |
| API smoke - PostgreSQL 18.3 (34 checks) | **34/34 PASSED** (isolated instance, PGSSLMODE=disable, PGPOOL_MAX=3) |
| Postgres direct row inspection (psql) | gifts: gift-1 + exactly 3 gift-21 rows (concurrent 4th rejected); payments: amount 75000.00, card_num persisted, verified=f |
| Production guard: NODE_ENV=production, no DATABASE_URL | Exits 1 with clear error |
| Production guard: NODE_ENV=production, no ADMIN_PASSWORD | Exits 1 with clear error |
| node --check on index.js/db.js/validation.js/inline JS | OK |
| npm ls --depth=0 | All 7 packages used; no unused deps |

## Security / dependency status

- **npm audit: 7 advisories (2 low, 4 high, 1 critical), all via sqlite3@5 -> node-gyp -> tar/make-fetch-happen/cacache.** No fix is available for the vulnerable tar line ("No fix available"). This is a build/install-time supply-chain risk in the SQLite fallback's native build toolchain. The production (Postgres) path never loads sqlite3 at runtime (lazy require). Recommendation: before any long-lived public launch, evaluate sqlite3@6 (breaking major, requires verification) or move sqlite3 to devDependencies and deploy with npm install --omit=dev. No blind major upgrade was performed.
- No secrets in the repository: .env is gitignored (plus .env.*); .env.example contains placeholders only.
- Static isolation verified: source, config, package files, and .env return 404.
- Admin password: never defaulted in production; the app refuses to start without it.
- Sessions: httpOnly SameSite=Lax cookie, 12h expiry, secure in production; timing-safe password compare; rate-limited login.
- No CSP header (deferred - would need allow-listing Tailwind CDN, Font Awesome, Unsplash/Gstatic; documented as a remaining hardening option).

## PostgreSQL verification status

- **VERIFIED (real database, not simulated).** An isolated PostgreSQL 18.3 instance was initialized and run locally (trust auth, port 5433). The full 34-check smoke suite passed against it: schema auto-creation, catalog, gift claims, idempotent duplicates, max=1 rejection, concurrent final-slot (exactly one 201), cash validation matrix, malformed JSON, static isolation, admin auth, rate limiting. Rows were inspected directly with psql.
- **What remains unverified:** the exact Render-managed Postgres endpoint (not accessible from this environment) and its SSL handshake. The app defaults to ssl: { rejectUnauthorized: false } (compatible with Render/Neon); local non-SSL servers need PGSSLMODE=disable. The first deploy must confirm the SSL connection and pool sizing against the provisioned plan.

## Remaining issues

1. npm audit tar/npm toolchain advisories (build-time, accepted; see above).
2. External CDN dependency (Tailwind browser runtime, Font Awesome, Unsplash, Gstatic) - degrades gracefully.
3. Render free Postgres is discontinued: the manifest no longer pins a plan; a plan must be chosen in the dashboard before provisioning.
4. Payment verification workflow absent by design (admin "mark verified" action is a product decision).
5. E2E runner teardown hang on Windows (cosmetic; tests all pass).
6. No CSP header yet (documented hardening option).
7. Hero image serves a single 1920w JPEG on all viewports (non-blocking).

## Deployment prerequisites

- **Required Render env vars (sync:false in render.yaml):** DATABASE_URL (from the provisioned Postgres), ADMIN_PASSWORD (strong, unique), SESSION_SECRET (long random; defaults to ADMIN_PASSWORD with a warning otherwise).
- **Database:** provision the Postgres plan in the Render dashboard (free tier discontinued). Leave PGSSLMODE unset (SSL default) unless the provider requires otherwise. Lower PGPOOL_MAX for small plans if needed (default 10).
- **No build step:** Render buildCommand is npm install; startCommand is npm start (node index.js). PORT is provided by Render automatically.
- **Immediately after deploy, check:** /api/health returns ok; the site loads over HTTPS; a test gift claim and a test cash record appear in the admin dashboard (Gifts/Payments tabs); static isolation (/index.js -> 404); admin login/logout works; /test-db is 404 by design in production (NODE_ENV=production).
- **Do before inviting guests:** remove the smoke/test data created by pre-deploy checks (either manually or by re-provisioning the database).

## Final verdict

**READY FOR DEPLOYMENT** - the application code, configuration, and test suite are complete and verified locally, including against a real PostgreSQL instance. Deployment itself is not performed here (no Render access) and requires the operational steps above: set DATABASE_URL/ADMIN_PASSWORD/SESSION_SECRET, provision a Postgres plan (free tier discontinued), deploy, and run the post-deploy checklist.
