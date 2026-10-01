# Billing POS — setup

The app runs in one of two modes, decided automatically by whether `.env` holds
Supabase credentials.

| | Demo mode | Online mode |
|---|---|---|
| Trigger | no `.env` | `.env` has both Supabase keys |
| Data | this browser only | Supabase Postgres, shared across devices |
| Logins | seeded `admin` / `shop` | real accounts you create |
| Use for | looking at the UI | actual shop use |

Right now you are in **demo mode**. Sign in with `shop` / `shop123` (a customer
account with the full POS) or `admin` / `admin123` (adds user management).

---

## Going online — about 10 minutes

### 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) — the free tier is enough
   (500 MB database, 50,000 monthly active users, no card required).
2. **New project.** Pick the region closest to the shop (`ap-south-1`, Mumbai,
   for India). Save the database password somewhere safe.

### 2. Create the tables

Open **SQL Editor → New query**, paste the whole of
[`supabase/schema.sql`](supabase/schema.sql), and run it.

That creates `profiles`, `shop_settings`, `menu_items`, `sale_sessions`,
`sales` and `sale_items`, plus the bill-number sequence, the session
close-out function, and row-level security policies so a shop account can run
the whole POS but cannot see or change the list of logins.

### 3. Point the app at it

**Project Settings → API**, then copy the two values into a new `.env` file in
this folder (`.env.example` is a template):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The anon key is safe in the browser — row-level security is what protects the
data. Never put the `service_role` key here.

Restart the dev server after editing `.env`.

### 4. Make your first admin

There is no self sign-up, so the first account is created by hand.

1. **Authentication → Users → Add user.** Use an email of the form
   `<username>@pos.local` (e.g. `owner@pos.local`), set a password, and tick
   *Auto Confirm User*.
2. Back in **SQL Editor**, run:

   ```sql
   select public.bootstrap_admin('owner@pos.local', 'owner', 'Shop Owner');
   ```

You can now sign in as `owner`.

Note that an admin owns no shop, so signing in as `owner` shows only
**Users & Access** — there is no till to open. That is expected.

### 4b. Create a shop for each customer — in the app

Once step 5 is done (it only has to be done once, ever), every login is created
**inside the app**. Sign in as the admin, go to **Users & Access → Add User**,
and fill in username, full name, password and role `user`.

That one button creates the Supabase auth login *and* the profile, and the
`provision_shop` trigger gives the new shop its settings row and its own bill
series starting at `BILL-1001`. No dashboard, no SQL.

The same screen disables, re-enables, renames, resets passwords and deletes.

<details>
<summary>SQL fallback, if the edge function is ever unavailable</summary>

Create the login in **Authentication → Users → Add user** (email
`<username>@pos.local`, tick *Auto Confirm User*), then in the SQL editor:

```sql
select public.bootstrap_shop('veg@pos.local', 'veg', 'Vegetable Shop');
```
</details>

### 5. Deploy the user-management function — once

Creating logins needs the `service_role` key, which must never reach the
browser, so it lives in an edge function. The CLI is already a dev dependency,
so there is nothing to install globally:

```bash
npx supabase login                     # once per machine, opens a browser
npx supabase functions deploy admin-users --project-ref <your-project-ref>
```

No `supabase link` and no Docker are needed — `--project-ref` is enough, and
the CLI uploads the source for bundling.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — you do not set them yourself.

Redeploy with the same command only if you edit
`supabase/functions/admin-users/index.ts`. Until it is deployed everything else
works; only Users & Access errors.

---

## Roles and tenancy

**One login is one shop.** A `user` profile *is* a shop: its `profiles.id` is
the `shop_id` stamped on every row that shop creates. An `admin` is you, the
vendor: you own no shop, you can read every shop, and you can write to none.

So three customers means three logins:

| Login | Sees |
|---|---|
| `veg` | only the vegetable shop's menu, prices, bills, cash-ups, settings |
| `hotel` | only the hotel's |
| `market` | only the supermarket's |
| `owner` (admin) | all three, read-only, plus user management |

| | Admin | Shop account |
|---|---|---|
| Billing, today's overview | — | ✅ |
| Its own sales history, Excel export | — | ✅ |
| End of sale (cash-up) | — | ✅ |
| Its own settings, menu, prices, logo | — | ✅ |
| Read **every** shop's data | ✅ (read-only) | — |
| Create and disable logins | ✅ | — |

Each shop also gets **its own bill number series**, each starting at
`BILL-1001`, so every business keeps a continuous GST invoice run.

### How the separation is enforced

Not in the UI — in the database. Every per-shop table carries `shop_id`
defaulting to `auth.uid()`, and the row-level security policies read:

```sql
-- select
using (shop_id = auth.uid() or public.is_admin())
-- insert / update / delete
using (shop_id = auth.uid() and public.is_shop())
```

`is_shop()` is false for an admin, so **the admin is read-only at the database
level**, not merely in the screens. A shop cannot stamp another shop's
`shop_id` even by crafting its own request, and cannot read another shop's rows
even by asking for them directly.

The admin reaches a shop's figures from **Users & Access → click the shop
name**, which opens a read-only view of its sales, menu, cash-ups and details.

---

## Working offline

**A sale is never lost because the internet is down.** The till keeps billing
through an outage and uploads everything once the connection returns.

| | Offline |
|---|---|
| Ring up a bill, print it | ✅ works |
| Bill numbers | ✅ series continues, no gaps |
| Menu, prices, shop details | ✅ from the last loaded copy |
| Today's totals | ✅ includes bills not yet uploaded |
| End of sale (cash-up) | ❌ needs the network |
| Editing the menu, Users & Access | ❌ needs the network |

Printing never needed the internet anyway — the bridge is on `127.0.0.1`.

**What the operator sees.** Nothing at all while online and uploaded, because
that is the normal state. When the connection drops, a badge appears in the top
bar: `Offline · 3 to upload`. When it returns the badge says `Syncing…` and
then disappears. There is no button to press.

**How it works.** Completed sales that cannot reach Supabase go into a local
outbox in `localStorage`, keyed by shop. They are replayed oldest-first when
the browser reports the network is back, and again every 30 seconds as a safety
net. Each sale carries a unique `transaction_id`, so if a reply is lost and the
upload is retried, the second attempt is recognised as already-landed rather
than creating a duplicate bill.

Only genuine network failures are queued. If the server actively *rejects* a
bill, that is a real answer — it is reported in a red banner naming the bill
numbers, not retried forever behind a growing queue.

**Bill numbering.** Offline the series continues from the last number this till
used. On reconnect the server's counter is advanced past every number issued
offline, so the next online bill cannot reuse one.

**The one limit:** two devices on the *same login* billing offline at the same
time will both continue from the same number and collide. One till per login is
the assumption throughout.

## Printing

Receipts print **through the bridge only**. There is no browser-print fallback.

The printer runs as **its own app**, separate from the browser.

### Daily use

Double-click **Receipt Printer** on the desktop each morning, then open the POS
in Chrome. Leave the small black window open while the shop is billing; closing
it stops receipts printing (billing itself carries on).

The window tells you where you stand:

```
  ============================================
    RECEIPT PRINTER
  ============================================

    Printer : RETSOL RTP-81
    Status  : found and ready

    Leave this window open while the shop is billing.
```

Open it twice by mistake and the second window says so and closes, rather than
showing an error.

### Building the app

```bash
npm run build:printer
```

That produces a single self-contained `printer-bridge/app/ReceiptPrinter.exe`
(~50 MB). Self-contained means **the .NET runtime is inside the file** — copy
the `app` folder to any Windows till and it runs, with nothing to install.

### Pointing it at a different printer

Edit `printer.txt` next to the exe and restart the app:

```
# The exact Windows name of the receipt printer.
RETSOL RTP-81
```

The app writes that file itself on first run, so a fresh build is always
configurable. If the name does not match a printer Windows knows about, the
window says `Status : NOT FOUND` and prints the path of the file to fix — so
one build can go to any shop whatever printer they own.

For development, `npm run printer-bridge` still runs it from source.

It listens on `http://127.0.0.1:9101` and sends raw ESC/POS to the printer,
then feeds and partial-cuts.

The browser fallback was removed deliberately: `window.print()` goes to whatever
Windows has set as the **default** printer, which on a POS machine is usually
the A4 inkjet rather than the till roll, and it cannot cut the paper. A receipt
from the wrong device is worse than a clear "the printer is not running", so
when the bridge is down the app now says so instead.

**A printer problem never loses a sale.** The bill is written to the database
first, then printed. If the bridge is down you get
*"BILL-1004 saved, but not printed"*, and you reprint from Sales Reports once
the bridge is back. Configuration → Receipt printer shows whether it is live.

The receipt prints the shop header, bill number, date, payment mode, customer,
every line item, then **Subtotal and TOTAL**, with your UPI ID in the footer. A
reprint is marked `*** REPRINT ***` at the top.

GST, discount, collected and change are deliberately **not** printed. They are
still calculated and still stored against every sale, so they remain in Sales
Reports and the Excel export — they are simply left off the customer's copy.
(Note that a GST-registered business is normally required to show the tax
charged on a tax invoice; that is a decision for you, not a technical limit.)

To change the printer name, edit `printerName` in
`printer-bridge/Program.cs`.

---

## Where things live

```
src/lib/db/           data layer — swap the backend here, nothing else
  index.js            picks the adapter from the env vars
  supabaseAdapter.js  production: Postgres + RLS
  localAdapter.js     demo: localStorage, no backend
src/lib/auth.jsx      session, current profile, route guards
src/lib/shop.jsx      shared settings + menu
src/pages/            one file per screen
src/components/ui/    buttons, cards, inputs, modal, badges
supabase/schema.sql   tables, policies, functions
supabase/functions/   admin-users edge function
```

No page talks to Supabase directly — everything goes through `src/lib/db`, so
moving to a different backend later means writing one new adapter.
