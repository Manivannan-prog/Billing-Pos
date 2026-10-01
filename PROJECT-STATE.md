# Billing POS — project state

**Last updated:** 24 September 2026
**Purpose:** hand this file to Claude at the start of a new session to resume
without re-explaining anything.

Project folder:
`C:\Users\ManivannanVenkatesan\OneDrive - NANOMATICS TECHNOLOGIES INDIA PRIVATE LIMITED\VS Project File\billing-software`

---

## 1. What this is

A billing / point-of-sale web app that a software vendor (me, the admin) sells
to individual shops. React + Vite front end, Supabase (Postgres) back end, and a
small local Windows app that drives the till-roll printer.

- **Vendor / admin** — owns no shop. Creates logins, and can *read* every
  shop's data but write to none.
- **Shop** — one login **is** one shop. Runs the whole POS for its own data only.

Live example customers: a vegetable shop, a hotel, a supermarket — three
separate logins on one shared database.

---

## 2. Current state — all verified working

| Piece | State |
|---|---|
| Supabase project | `dyfcjlpcygvwfnsqucds`, ap-south-1, Postgres 17.6 |
| Multi-tenant schema | applied and live |
| `admin-users` edge function | deployed |
| In-app user creation | working (Users & Access → Add User) |
| Offline billing + auto-sync | built, tested |
| Receipt printer | standalone app, `printer-bridge/app/ReceiptPrinter.exe` |
| `.env` | correct (URL + anon key verified) |

**Accounts:** one admin, `owner`. No shop accounts created yet — they get
created from inside the app.

---

## 3. Architecture decisions (and why)

These were deliberate choices. Don't silently reverse them.

### One login = one shop
`profiles.id` **is** the `shop_id` stamped on every data table. Chosen over a
separate `shops` table with multiple staff logins per shop. Consequence: a shop
cannot have a second cashier login without reworking this.

### Isolation is enforced in the database, not the UI
Every per-shop table carries `shop_id` defaulting to `auth.uid()`, with RLS:

```sql
-- select
using ((shop_id = auth.uid() and public.is_shop()) or public.is_admin())
-- insert / update / delete
using (shop_id = auth.uid() and public.is_shop())
```

`is_shop()` is false for an admin, so **the admin is read-only at the database
level**. Filtering only in the front end would be cosmetic — anyone could
re-issue the request without the filter.

The `is_shop()` in the *select* policy matters: without it a **disabled** shop
could still read all its data, so "disabled" would mean read-only rather than
revoked. (This was a real bug, found by testing, fixed.)

**Deliberate exception:** a disabled account can still read its own `profiles`
row, so the login screen can say "This account has been disabled" instead of
"This login has no profile".

### Per-shop bill numbering
Each shop has a `bill_counters` row starting at 1001, so every business keeps
its own continuous GST invoice series. Replaced a single global sequence that
interleaved numbers across shops.

### One open till session per shop
`sale_sessions_one_open_per_shop_idx` is unique on `(shop_id) where closed_at
is null`. The original schema allowed only one open session in the *entire*
database, which blocked every shop but the first from trading.

### Printing is bridge-only
No browser-print fallback. `window.print()` goes to the Windows *default*
printer — usually the office A4, not the till roll — and cannot cut paper. A
receipt from the wrong device is worse than a clear "printer is not running".

**A printer failure never loses a sale:** the bill is saved first, then printed.
On failure the app says "saved, but not printed" and it can be reprinted from
Sales Reports.

### Receipt shows Subtotal and TOTAL only
GST, discount, collected and change are **not printed**, by explicit request.
They are still calculated and stored, and still appear in Sales Reports and the
Excel export. (Noted at the time: a GST-registered business is normally required
to show tax charged on a tax invoice. This was accepted as a business decision.)

### Offline-first billing
Local outbox in `localStorage`, no service worker, no IndexedDB — a till does
hundreds of bills a day, not millions, and `localStorage` is synchronous at the
moment a sale completes.

Only **genuine network failures** are queued. A row the server actively rejects
is a real answer and is surfaced in a red banner, not retried forever.

---

## 4. Key files

```
src/lib/db/index.js            picks the adapter; exports the sync surface
src/lib/db/supabaseAdapter.js  raw Supabase calls
src/lib/db/offlineAdapter.js   offline wrapper: cache + outbox + sync()
src/lib/db/localAdapter.js     demo mode (no backend), multi-tenant too
src/lib/offlineStore.js        localStorage cache + outbox + isNetworkError()
src/lib/sync.jsx               SyncProvider / useSync() — online state, auto-flush
src/lib/auth.jsx               session, RequireAuth (adminOnly / shopOnly)
src/lib/shop.jsx               shared settings + menu
src/pages/ShopDetail.jsx       admin's read-only view of one shop
src/pages/Users.jsx            Add User; shop names link to ShopDetail
src/utils/receiptPrinter.js    bridge-only printing
supabase/schema.sql            tables, RLS, functions  (idempotent, safe to re-run)
supabase/functions/admin-users/index.ts   creates logins with service_role
printer-bridge/Program.cs      the Windows printer app
printer-bridge/app/            published ReceiptPrinter.exe (gitignored)
```

`supabase/schema.single-tenant.sql.bak` is the old pre-multi-tenant schema, kept
only as a reference for the upgrade path.

---

## 5. Running it

```bash
npm run dev              # POS at http://localhost:5173
npm run printer-bridge   # printer, from source (development)
npm run build:printer    # builds printer-bridge/app/ReceiptPrinter.exe
npm run lint
npm run build
```

Daily use on a till: double-click **Receipt Printer** (desktop shortcut), leave
the window open, open the POS in Chrome.

Change the printer: edit `printer.txt` next to the exe, restart the app. The app
writes that file itself on first run.

Supabase CLI is a dev dependency and is **already logged in** on this machine:

```bash
npx supabase functions deploy admin-users --project-ref dyfcjlpcygvwfnsqucds
```

Redeploy only if `supabase/functions/admin-users/index.ts` changes.

---

## 6. How things were verified

Testing was done by *executing*, not by reading code. Worth repeating rather
than trusting future changes by eye:

- **PGlite** (real PostgreSQL 18 in WASM) runs `schema.sql` with a stubbed
  Supabase `auth` schema and real RLS. Caught `min(uuid)` (no such aggregate)
  and the disabled-shop read hole. 42 checks across three suites: RLS isolation,
  the edge function's insert path, and the upgrade from the old schema.
- **Live end-to-end** against the real project: created throwaway shops through
  the deployed function, proved isolation and admin read-only, then deleted
  them. 33 checks.
- **Offline**: the Supabase adapter stubbed so the network can be dropped
  mid-shift. 27 checks.
- **Demo adapter**: bundled with rolldown and driven under Node. 20 checks.

Lesson learned the hard way: parsing SQL is not enough — a type error like
`min(uuid)` only shows up when it actually runs.

---

## 6b. Fixes of 24 September 2026

Found from the Supabase logs and advisor, then by re-testing end to end.

- **Security (critical):** `bootstrap_admin` / `bootstrap_shop` were callable by
  anyone via `/rest/v1/rpc` with just the anon key, and public sign-up was on.
  EXECUTE is now revoked (see "Function privileges" at the end of
  `schema.sql`), and sign-up is disabled in Auth settings. Logins are created
  only through the `admin-users` function, which is unaffected.
- **409 on `current_session`:** two screens opening at once on a new shop both
  tried to create the open session. It now uses `on conflict do nothing` and
  re-reads. `close_sale_session` refuses a double close.
- **Offline sync could silently drop a bill** whose number was already taken
  on the server (any duplicate was treated as "already uploaded"). Now such a
  bill is filed under a fresh number and the till is told (banner). The server
  counter is advanced past offline numbers *before* uploading.
- **Half-finished upload** (header saved, items not) left a bill with no lines.
  `sales.create` is now idempotent on `transaction_id` and fills in items.
- A bill mid-upload appeared twice in Reports/Overview totals — deduplicated.
- "End of sale" is refused while offline or while bills are waiting to upload.
- Billing: "not saved" error shown for a saved sale if the next-number preview
  failed; "Browser printing" badge renamed "Printer offline".
- Performance: RLS calls wrapped in `(select …)`, 4 foreign-key indexes added.

Verified: PGlite schema suite 22/22, live API end-to-end 42/42, headless
Chrome UI run 19/19 (login, config, billing, offline + resync, end of sale,
admin view). Throwaway `e2e-*` accounts were created and deleted.

Remaining advisor items are expected: 7 × "authenticated can execute SECURITY
DEFINER" (the app must call them), 2 × unused index (new), and leaked-password
protection (a dashboard toggle, Auth → Settings).

## 7. Outstanding

1. **Printer test on real hardware** — in progress at the time of writing.
   Check: Subtotal/TOTAL only, header, bill number, date, payment mode,
   customer, UPI in footer, paper feeds and partial-cuts. Reprints should show
   `*** REPRINT ***`.
2. **Create the three shop logins** — Users & Access → Add User (`veg`, `hotel`,
   `market`). Passwords must be 8+ characters.
3. **Change the `owner` admin password** — it is currently 5 characters, below
   Supabase's minimum, and flagged weak. Change it from Users & Access.
4. **~100 MB of stale build folders** still in `printer-bridge/`
   (`publish/`, `download/`, `ReceiptPrinterBridge-win-x64/`, and the old
   `.zip`) — superseded by `printer-bridge/app/`, and syncing to OneDrive.
   Safe to delete; left alone because they predate this work.
5. **Code signing** — `ReceiptPrinter.exe` is unsigned, so Windows SmartScreen
   warns on first run. Only worth solving if shipping to many customers.

---

## 8. Known limits

- **One till per login.** Two devices on the *same* login billing offline at the
  same time will both continue from the same bill number and collide. This is
  load-bearing for offline numbering.
- **Deleting a login deletes that shop's data** (`on delete cascade`). Prefer
  *disable* for a shop that stops paying — it revokes access but keeps records.
- **Offline limits:** cash-up, menu editing and Users & Access all need the
  network. Billing, printing and today's totals do not.
- The offline history list fills when a shop opens Overview or Reports while
  online. A till that goes offline having never opened them still bills fine,
  but its history shows empty until it reconnects.
- **Admin has no till.** Billing, Overview, Reports and Configuration are
  shop-only; `owner` sees just Users & Access. This follows from one-login-one-shop.

---

## 9. Secrets

Not in this file, by design.

- `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. It is
  gitignored. The anon key is safe in a browser — RLS is what protects the data.
- **Never** put the `service_role` key in a `VITE_` variable; Vite bundles those
  into the browser. It lives only in the edge function, injected by Supabase.
