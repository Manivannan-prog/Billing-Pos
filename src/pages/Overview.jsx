import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { sales as salesApi, sessions as sessionsApi } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useShop } from "../lib/shop";
import { formatCurrency } from "../utils/billHelper";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";

const dateKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`;
};

function Overview() {
  const { profile } = useAuth();
  const { settings } = useShop();

  const [sales, setSales] = useState([]);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [rows, current] = await Promise.all([salesApi.list(), sessionsApi.current()]);
        if (cancelled) return;
        setSales(rows);
        setSession(current);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const todayKey = dateKey(new Date());
    const todaySales = sales.filter((sale) => dateKey(sale.createdDate) === todayKey);

    const revenue = todaySales.reduce((total, sale) => total + Number(sale.grandTotal || 0), 0);
    const itemsSold = todaySales.reduce(
      (count, sale) =>
        count + (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      0,
    );

    const paymentTotals = Object.entries(
      todaySales.reduce((totals, sale) => {
        const mode = sale.paymentMode || "Unknown";
        totals[mode] = (totals[mode] || 0) + Number(sale.grandTotal || 0);
        return totals;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

    const topItems = Object.values(
      sales.reduce((items, sale) => {
        (sale.items || []).forEach((item) => {
          const name = item.name || "Unknown";
          items[name] = items[name] || { name, quantity: 0, revenue: 0 };
          items[name].quantity += Number(item.quantity || 0);
          items[name].revenue += Number(item.price || 0) * Number(item.quantity || 0);
        });
        return items;
      }, {}),
    )
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = dateKey(date);
      const amount = sales.reduce(
        (total, sale) =>
          dateKey(sale.createdDate) === key ? total + Number(sale.grandTotal || 0) : total,
        0,
      );
      return {
        key,
        label: date.toLocaleDateString("en-IN", { weekday: "short" }),
        amount,
      };
    });

    return {
      todaySales,
      revenue,
      itemsSold,
      paymentTotals,
      topItems,
      week,
      weekMax: Math.max(...week.map((day) => day.amount), 1),
      averageBill: todaySales.length ? revenue / todaySales.length : 0,
    };
  }, [sales]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const firstName = String(profile?.fullName || "").split(" ")[0];

  return (
    <div>
      <PageHeader
        title={`Good day${firstName ? `, ${firstName}` : ""}`}
        subtitle={
          settings.shopName
            ? `${settings.shopName} · today at a glance`
            : "Today at a glance"
        }
      >
        <Link to="/billing">
          <Button icon="billing">New sale</Button>
        </Link>
      </PageHeader>

      {error && (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Today's revenue"
          value={formatCurrency(stats.revenue)}
          hint={`${stats.todaySales.length} bill${stats.todaySales.length === 1 ? "" : "s"}`}
          tone="primary"
          icon="cash"
        />
        <StatCard
          label="Items sold today"
          value={stats.itemsSold}
          hint="Across all bills"
          icon="billing"
        />
        <StatCard
          label="Average bill"
          value={formatCurrency(stats.averageBill)}
          hint="Today"
          icon="reports"
        />
        <StatCard
          label="Open session"
          value={session ? new Date(session.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
          hint={session ? "Since this time" : "No session"}
          icon="clock"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Last 7 days" subtitle="Revenue per day" />
          <div className="px-5 py-5">
            <div className="flex h-48 items-end gap-2 sm:gap-3">
              {stats.week.map((day) => (
                <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="tabular text-[11px] font-semibold text-text-muted">
                    {day.amount ? formatCurrency(day.amount).replace(".00", "") : "—"}
                  </span>
                  <div
                    className="w-full max-w-14 rounded-t-md bg-primary/85 transition-all"
                    style={{ height: `${Math.max((day.amount / stats.weekMax) * 100, 3)}%` }}
                  />
                  <span className="text-[11px] text-text-muted">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payments today" subtitle="By mode" />
          <div className="px-5 py-4">
            {stats.paymentTotals.length ? (
              <div className="space-y-3">
                {stats.paymentTotals.map(([mode, amount]) => {
                  const share = stats.revenue ? (amount / stats.revenue) * 100 : 0;
                  return (
                    <div key={mode}>
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className="font-medium text-text">{mode}</span>
                        <span className="tabular font-semibold">{formatCurrency(amount)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-text-muted">No payments today yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent bills"
            subtitle="Latest transactions"
            action={
              <Link to="/reports">
                <Button size="sm" variant="secondary">
                  View all
                </Button>
              </Link>
            }
          />
          {sales.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-muted">
                    <th className="px-5 py-2.5 font-semibold">Bill</th>
                    <th className="px-5 py-2.5 font-semibold">Customer</th>
                    <th className="px-5 py-2.5 font-semibold">Payment</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sales.slice(0, 8).map((sale) => (
                    <tr key={sale.transactionId} className="hover:bg-surface-2/60">
                      <td className="px-5 py-2.5">
                        <span className="tabular font-medium text-text">{sale.billNumber}</span>
                        <span className="ml-2 text-[11px] text-text-muted">
                          {new Date(sale.createdDate).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-text-muted">{sale.customerName || "—"}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone="neutral">{sale.paymentMode}</Badge>
                      </td>
                      <td className="tabular px-5 py-2.5 text-right font-semibold text-text">
                        {formatCurrency(sale.grandTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No sales yet"
              description="Completed bills will appear here."
              action={
                <Link to="/billing">
                  <Button icon="billing">Start a sale</Button>
                </Link>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Top sellers" subtitle="All time" />
          <div className="px-5 py-4">
            {stats.topItems.length ? (
              <ol className="space-y-3">
                {stats.topItems.map((item, index) => (
                  <li key={item.name} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[11px] font-semibold text-text-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-text">{item.name}</p>
                      <p className="text-[11px] text-text-muted">{item.quantity} sold</p>
                    </div>
                    <span className="tabular text-[13px] font-semibold text-text">
                      {formatCurrency(item.revenue)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-[13px] text-text-muted">
                No item sales recorded yet.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Overview;
