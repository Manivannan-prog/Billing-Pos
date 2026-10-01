# Billing POS

A point-of-sale and billing app for a food shop: touch billing, GST receipts,
sales reporting, and admin-issued logins. React + Vite + Tailwind on the front,
Supabase (Postgres) behind it.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run printer-bridge   # on the POS machine only, for silent thermal printing
```

With no `.env` the app starts in **demo mode** — everything works, data stays in
the browser. Sign in with `shop` / `shop123` (full POS) or `admin` / `admin123`
(adds user management).

To connect the real backend, follow [SETUP.md](SETUP.md).

## What it does

**Billing** — item tiles with search, category tabs and favourites; drag to
rearrange the tiles; cart with quantity stepping; customer name and mobile;
payment mode; collected amount with change due; GST and standing discount
applied from settings; bill numbers issued from a gapless sequence at the
moment of sale.

**Shop logo** — upload it from the left navigation or from Configuration; it
appears in the side menu and prints on every receipt.

**Overview** — today's revenue, items sold, average bill, open session, a
seven-day revenue chart, payment split and top sellers. Visible to everyone.

**Sales reports** — date range, payment mode, item and free-text
filters; daily/weekly/monthly/yearly revenue trend; per-bill detail; reprint;
edit a past bill; end-of-sale cash-up with the payment breakdown; Excel export
with three sheets (bills, line items, item summary).

**Configuration** — shop name, address, phone, GSTIN, UPI ID, logo; GST
and discount rules; full menu CRUD; live printer-bridge status.

**Users & access** (admin only) — the vendor's screen. Issue a login to a shop
that has bought the app, set it to admin or shop account, reset passwords,
disable or delete. No self sign-up. The last active admin cannot be demoted,
disabled or deleted.

**Roles** — `admin` is the vendor and can do everything. `user` is the shop and
runs the whole POS: billing, reports, exports, cash-up, prices, menu, settings
and logo. Only the Administration section is withheld.

## Printing

Receipts prefer the local Windows bridge (raw ESC/POS to `RETSOL RTP-81`, feed
and partial cut) and fall back to an 80 mm browser print if it is not running,
so a sale is never blocked. See [SETUP.md](SETUP.md#printing).

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` | eslint |
| `npm run printer-bridge` | local thermal printer bridge (.NET 10) |
