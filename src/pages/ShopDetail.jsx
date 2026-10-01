import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  menu as menuApi,
  sales as salesApi,
  sessions as sessionsApi,
  settings as settingsApi,
  shops as shopsApi,
} from "../lib/db";
import { formatCurrency } from "../utils/billHelper";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";

const when = (value) =>
  value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "menu", label: "Menu & prices" },
  { key: "cashups", label: "Cash-ups" },
  { key: "settings", label: "Shop details" },
];

/**
 * The admin's read-only window onto one shop.
 *
 * Nothing here can write: the adapter is only ever asked to read, and the
 * database refuses an admin write regardless, because every write policy
 * requires `shop_id = auth.uid()` and an admin owns no shop. So a mistake in
 * this screen cannot damage a customer's live data.
 */
function ShopDetail() {
  const { shopId } = useParams();

  const [shop, setShop] = useState(null);
  const [shopSettings, setShopSettings] = useState(null);
  const [sales, setSales] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [cashups, setCashups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("sales");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [shopRow, settingsRow, saleRows, menuRows, sessionRows] = await Promise.all([
          shopsApi.get(shopId),
          settingsApi.get(shopId),
          salesApi.list({ shopId }),
          menuApi.list(shopId),
          sessionsApi.listClosed(shopId),
        ]);
        if (cancelled) return;
        setShop(shopRow);
        setShopSettings(settingsRow);
        setSales(saleRows);
        setMenuItems(menuRows);
        setCashups(sessionRows);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, reloadKey]);

  const retry = useCallback(() => {
    setError("");
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  const totals = useMemo(() => {
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
    const byMode = sales.reduce((modes, sale) => {
      const mode = sale.paymentMode || "Unknown";
      modes[mode] = (modes[mode] || 0) + Number(sale.grandTotal || 0);
      return modes;
    }, {});
    return { revenue, byMode };
  }, [sales]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert tone="danger" action={<Button size="sm" variant="ghost" onClick={retry}>Retry</Button>}>
          {error}
        </Alert>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState
          icon="users"
          title="Shop not found"
          description="This login may have been removed, or it is not a shop account."
        />
      </div>
    );
  }

  const title = shop.shopName || shop.fullName || shop.username;

  return (
    <div className="space-y-5">
      <BackLink />

      <PageHeader title={title} subtitle={`@${shop.username} · read-only view`}>
        {shop.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>}
      </PageHeader>

      <Alert tone="info" icon="lock">
        You are viewing this shop as the admin. Nothing on this page can be edited — the
        database only permits a shop to change its own data.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bills" value={shop.billCount} icon="receipt" />
        <StatCard label="Total sales" value={formatCurrency(totals.revenue)} icon="cash" />
        <StatCard label="Menu items" value={menuItems.length} icon="menu" />
        <StatCard label="Last sale" value={shop.lastSaleAt ? when(shop.lastSaleAt) : "—"} hint={shop.lastSaleAt ? undefined : "No sales yet"} icon="clock" />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition ${
              tab === entry.key
                ? "border-primary text-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "sales" && <SalesTab sales={sales} byMode={totals.byMode} />}
      {tab === "menu" && <MenuTab items={menuItems} />}
      {tab === "cashups" && <CashupsTab sessions={cashups} />}
      {tab === "settings" && <SettingsTab settings={shopSettings} shop={shop} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/users"
      className="inline-flex items-center gap-1.5 text-[13px] text-text-muted transition hover:text-text"
    >
      <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
      Users &amp; Access
    </Link>
  );
}

function SalesTab({ sales, byMode }) {
  if (!sales.length) {
    return (
      <EmptyState icon="receipt" title="No sales yet" description="This shop has not rung up a bill." />
    );
  }

  return (
    <div className="space-y-4">
      {Object.keys(byMode).length > 1 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(byMode).map(([mode, total]) => (
            <StatCard key={mode} label={mode} value={formatCurrency(total)} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="Sales history"
          subtitle={`${sales.length} bill${sales.length === 1 ? "" : "s"}`}
        />

        {/* Card per bill on phones; the table below takes over from lg up. */}
        <div className="divide-y divide-border lg:hidden">
          {sales.map((sale) => (
            <div key={sale.id} className="space-y-1 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-text">{sale.billNumber}</p>
                <p className="tabular font-semibold text-text">{formatCurrency(sale.grandTotal)}</p>
              </div>
              <p className="text-[11px] text-text-muted">{when(sale.createdDate)}</p>
              <p className="text-[11px] text-text-muted">
                {sale.paymentMode}
                {sale.customerName ? ` · ${sale.customerName}` : ""}
                {` · ${(sale.items || []).length} item${(sale.items || []).length === 1 ? "" : "s"}`}
              </p>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 font-medium">Bill</th>
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-5 py-2.5 font-medium">Customer</th>
                <th className="px-5 py-2.5 font-medium">Payment</th>
                <th className="px-5 py-2.5 text-right font-medium">Items</th>
                <th className="px-5 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 font-medium text-text">{sale.billNumber}</td>
                  <td className="px-5 py-3 text-text-muted">{when(sale.createdDate)}</td>
                  <td className="px-5 py-3 text-text-muted">{sale.customerName || "—"}</td>
                  <td className="px-5 py-3 text-text-muted">{sale.paymentMode}</td>
                  <td className="px-5 py-3 text-right tabular text-text-muted">
                    {(sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}
                  </td>
                  <td className="px-5 py-3 text-right tabular font-medium text-text">
                    {formatCurrency(sale.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MenuTab({ items }) {
  if (!items.length) {
    return (
      <EmptyState
        icon="menu"
        title="No menu items"
        description="This shop has not added anything to its menu yet."
      />
    );
  }

  return (
    <Card>
      <CardHeader title="Menu & prices" subtitle={`${items.length} active item${items.length === 1 ? "" : "s"}`} />
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-text">{item.name}</p>
              {item.category && <p className="text-[11px] text-text-muted">{item.category}</p>}
            </div>
            <p className="tabular shrink-0 text-[13px] font-medium text-text">
              {formatCurrency(item.price)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CashupsTab({ sessions }) {
  if (!sessions.length) {
    return (
      <EmptyState
        icon="clock"
        title="No cash-ups yet"
        description="Closed sale sessions will appear here once this shop ends a sale."
      />
    );
  }

  return (
    <Card>
      <CardHeader title="Cash-ups" subtitle={`${sessions.length} closed session${sessions.length === 1 ? "" : "s"}`} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-text-muted">
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 font-medium">Opened</th>
              <th className="px-5 py-2.5 font-medium">Closed</th>
              <th className="px-5 py-2.5 text-right font-medium">Bills</th>
              <th className="px-5 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-text-muted">{when(session.startTime)}</td>
                <td className="px-5 py-3 text-text-muted">{when(session.closedAt)}</td>
                <td className="px-5 py-3 text-right tabular text-text-muted">{session.billCount}</td>
                <td className="px-5 py-3 text-right tabular font-medium text-text">
                  {formatCurrency(session.totalSales)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SettingsTab({ settings, shop }) {
  const rows = [
    ["Shop name", settings?.shopName],
    ["GST number", settings?.gstNumber],
    ["Address", settings?.address],
    ["Phone", settings?.phone],
    ["UPI ID", settings?.upiId],
    ["GST charged", settings?.enableGST ? `Yes · ${settings.gstPercentage}%` : "No"],
    [
      "Discount",
      settings?.enableDiscount ? `Yes · ${settings.discountPercentage}%` : "No",
    ],
    ["Login", `@${shop.username}`],
    ["Account created", when(shop.createdAt)],
  ];

  return (
    <Card>
      <CardHeader title="Shop details" subtitle="As this shop has configured them" />
      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-4 px-5 py-2.5">
            <dt className="w-40 shrink-0 text-[12px] text-text-muted">{label}</dt>
            <dd className="min-w-0 flex-1 break-words text-[13px] text-text">
              {value || <span className="text-text-muted">Not set</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default ShopDetail;
