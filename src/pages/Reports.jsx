import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sales as salesApi, sessions as sessionsApi } from "../lib/db";
import { useShop } from "../lib/shop";
import { useSync } from "../lib/sync";
import { formatCurrency } from "../utils/billHelper";
import { printReceipt } from "../utils/receiptPrinter";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
} from "../components/ui";

const PERIODS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const asDate = (sale) => {
  const date = new Date(sale.createdDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const periodKey = (sale, period) => {
  const date = asDate(sale);
  if (!date) return "Unknown";
  if (period === "year") return String(date.getFullYear());
  if (period === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (period === "week") {
    const start = new Date(date);
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return dayKey(start);
  }
  return dayKey(date);
};

function Reports() {
  const navigate = useNavigate();
  const { settings } = useShop();
  const { isOnline, pending } = useSync();

  const [sales, setSales] = useState([]);
  const [closedSessions, setClosedSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const [period, setPeriod] = useState("day");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [search, setSearch] = useState("");

  const [printingKey, setPrintingKey] = useState("");
  const [detailSale, setDetailSale] = useState(null);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const load = async () => {
    try {
      const [rows, sessions] = await Promise.all([salesApi.list(), sessionsApi.listClosed()]);
      setSales(rows);
      setClosedSessions(sessions);
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetching on mount is exactly what this effect is for: load() awaits the
    // backend before it touches state, so there is no synchronous cascade. The
    // rule cannot see past the call, hence the narrow exemption.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  /* ---------------------------------------------------------- filtering -- */

  const paymentModes = useMemo(
    () => [...new Set(sales.map((sale) => sale.paymentMode).filter(Boolean))].sort(),
    [sales],
  );

  const itemNames = useMemo(
    () =>
      [...new Set(sales.flatMap((sale) => (sale.items || []).map((item) => item.name)))].sort(),
    [sales],
  );

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    const term = search.trim().toLowerCase();

    return sales.filter((sale) => {
      const date = asDate(sale);
      if (from && (!date || date < from)) return false;
      if (to && (!date || date > to)) return false;
      if (paymentFilter && sale.paymentMode !== paymentFilter) return false;
      if (itemFilter && !(sale.items || []).some((item) => item.name === itemFilter)) return false;
      if (
        term &&
        !sale.billNumber.toLowerCase().includes(term) &&
        !(sale.customerName || "").toLowerCase().includes(term) &&
        !(sale.customerMobile || "").includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [sales, fromDate, toDate, paymentFilter, itemFilter, search]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
    const gst = filtered.reduce((sum, sale) => sum + Number(sale.gstAmount || 0), 0);
    const discount = filtered.reduce((sum, sale) => sum + Number(sale.discountAmount || 0), 0);
    const items = filtered.reduce(
      (sum, sale) => sum + (sale.items || []).reduce((n, item) => n + Number(item.quantity || 0), 0),
      0,
    );
    return {
      revenue,
      gst,
      discount,
      items,
      average: filtered.length ? revenue / filtered.length : 0,
    };
  }, [filtered]);

  const chart = useMemo(() => {
    const grouped = filtered.reduce((buckets, sale) => {
      const key = periodKey(sale, period);
      buckets[key] = buckets[key] || { key, revenue: 0, bills: 0 };
      buckets[key].revenue += Number(sale.grandTotal || 0);
      buckets[key].bills += 1;
      return buckets;
    }, {});

    const rows = Object.values(grouped).sort((a, b) => a.key.localeCompare(b.key)).slice(-14);
    return { rows, max: Math.max(...rows.map((row) => row.revenue), 1) };
  }, [filtered, period]);

  /* ------------------------------------------------------------ actions -- */

  const exportExcel = async () => {
    // xlsx is ~600 kB, so it is fetched only when someone actually exports.
    const XLSX = await import("xlsx");

    const billsSheet = XLSX.utils.json_to_sheet(
      filtered.map((sale) => ({
        "Bill Number": sale.billNumber,
        Date: asDate(sale)?.toLocaleString("en-IN") ?? "",
        Customer: sale.customerName || "",
        Mobile: sale.customerMobile || "",
        "Payment Mode": sale.paymentMode,
        Subtotal: Number(sale.subtotal || 0),
        GST: Number(sale.gstAmount || 0),
        Discount: Number(sale.discountAmount || 0),
        Total: Number(sale.grandTotal || 0),
        "Billed By": sale.soldByName || "",
      })),
    );

    const lineRows = filtered.flatMap((sale) =>
      (sale.items || []).map((item) => ({
        "Bill Number": sale.billNumber,
        Date: asDate(sale)?.toLocaleDateString("en-IN") ?? "",
        Item: item.name,
        Quantity: Number(item.quantity || 0),
        "Unit Price": Number(item.price || 0),
        "Line Total": Number(item.price || 0) * Number(item.quantity || 0),
      })),
    );

    const itemSummary = Object.values(
      filtered.reduce((items, sale) => {
        (sale.items || []).forEach((item) => {
          items[item.name] = items[item.name] || { Item: item.name, Quantity: 0, Revenue: 0 };
          items[item.name].Quantity += Number(item.quantity || 0);
          items[item.name].Revenue += Number(item.price || 0) * Number(item.quantity || 0);
        });
        return items;
      }, {}),
    ).sort((a, b) => b.Quantity - a.Quantity);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, billsSheet, "Bills");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lineRows), "Line Items");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemSummary), "Item Summary");
    XLSX.writeFile(workbook, `sales-report-${dayKey(new Date())}.xlsx`);
  };

  const reprint = async (sale) => {
    const key = sale.transactionId;
    setPrintingKey(key);
    setNotice(null);
    try {
      await printReceipt(sale, settings, true);
      setNotice({ tone: "success", text: `${sale.billNumber} reprinted.` });
    } catch (error) {
      setNotice({ tone: "danger", text: `Could not reprint ${sale.billNumber}: ${error.message}` });
    } finally {
      setPrintingKey("");
    }
  };

  const closeSession = async () => {
    // The server totals the session from the bills it holds. Bills still in
    // this till's upload queue would be left out of the cash-up for good, and
    // later land in a session that is already closed.
    if (!isOnline || pending > 0) {
      setConfirmClose(false);
      setNotice({
        tone: "warning",
        text: !isOnline
          ? "End of sale needs the internet. Reconnect and try again."
          : `${pending} bill${pending === 1 ? " is" : "s are"} still waiting to upload. End of sale once the upload finishes.`,
      });
      return;
    }

    setIsClosingSession(true);
    try {
      const closed = await sessionsApi.close();
      setConfirmClose(false);
      setNotice({
        tone: "success",
        text: `Session closed · ${closed.billCount} bills · ${formatCurrency(closed.totalSales)}`,
      });
      load();
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setIsClosingSession(false);
    }
  };

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setPaymentFilter("");
    setItemFilter("");
    setSearch("");
  };

  const hasFilters = fromDate || toDate || paymentFilter || itemFilter || search;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Sales reports" subtitle="Every bill, filterable and exportable">
        <Button variant="secondary" icon="download" onClick={exportExcel} disabled={!filtered.length}>
          Export Excel
        </Button>
        <Button icon="clock" onClick={() => setConfirmClose(true)}>
          End of sale
        </Button>
      </PageHeader>

      {notice && (
        <Alert
          tone={notice.tone}
          icon={notice.tone === "success" ? "check" : "alert"}
          className="mb-5"
        >
          {notice.text}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Revenue" value={formatCurrency(totals.revenue)} tone="primary" icon="cash" />
        <StatCard label="Bills" value={filtered.length} icon="receipt" />
        <StatCard label="Items sold" value={totals.items} icon="billing" />
        <StatCard label="Average bill" value={formatCurrency(totals.average)} icon="reports" />
        <StatCard label="GST collected" value={formatCurrency(totals.gst)} icon="lock" />
      </div>

      {/* -------------------------------------------------------- filters -- */}
      <Card className="mt-5 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="From" className="xl:col-span-1">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To" className="xl:col-span-1">
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <Field label="Payment mode">
            <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="">All modes</option>
              {paymentModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </Select>
          </Field>
          <Field label="Item">
            <Select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
              <option value="">All items</option>
              {itemNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Search" className="xl:col-span-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Bill no, customer, mobile"
                  className="pl-9"
                />
              </div>
              {hasFilters && (
                <Button variant="secondary" onClick={resetFilters}>
                  Reset
                </Button>
              )}
            </div>
          </Field>
        </div>
      </Card>

      {/* ---------------------------------------------------------- chart -- */}
      <Card className="mt-5">
        <CardHeader
          title="Revenue trend"
          subtitle={`Grouped ${period === "day" ? "daily" : `by ${period}`}`}
          action={
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
              {PERIODS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPeriod(option.value)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    period === option.value
                      ? "bg-primary text-white"
                      : "text-text-muted hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="px-5 py-5">
          {chart.rows.length ? (
            <div className="flex h-52 items-end gap-2 overflow-x-auto scrollbar-thin">
              {chart.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex h-full min-w-[42px] flex-1 flex-col items-center justify-end gap-2"
                  title={`${row.key} · ${formatCurrency(row.revenue)} · ${row.bills} bills`}
                >
                  <span className="tabular text-[10px] font-semibold text-text-muted">
                    {formatCurrency(row.revenue).replace(".00", "")}
                  </span>
                  <div
                    className="w-full max-w-12 rounded-t-md bg-primary/85"
                    style={{ height: `${Math.max((row.revenue / chart.max) * 100, 3)}%` }}
                  />
                  <span className="max-w-full truncate text-[10px] text-text-muted">{row.key}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-text-muted">
              No sales match the current filters.
            </p>
          )}
        </div>
      </Card>

      {/* ----------------------------------------------------------- bills -- */}
      <Card className="mt-5">
        <CardHeader title="Bills" subtitle={`${filtered.length} matching`} />
        {filtered.length ? (
          <>
          {/* Phones get a card per bill; a seven-column table cannot be read at 390px. */}
          <div className="divide-y divide-border lg:hidden">
            {filtered.map((sale) => (
              <div key={sale.transactionId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular text-[13px] font-semibold text-text">{sale.billNumber}</p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {asDate(sale)?.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="tabular shrink-0 font-display text-[17px] font-semibold text-primary">
                    {formatCurrency(sale.grandTotal)}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
                  <Badge tone="neutral">{sale.paymentMode}</Badge>
                  <span>
                    {(sale.items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)} items
                  </span>
                  {sale.customerName && <span>· {sale.customerName}</span>}
                </div>

                <div className="mt-2.5 flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setDetailSale(sale)}>
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate("/billing", { state: { editingBill: sale } })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="print"
                    disabled={printingKey === sale.transactionId}
                    onClick={() => reprint(sale)}
                  >
                    {printingKey === sale.transactionId ? "…" : "Reprint"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Bill</th>
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-5 py-2.5 font-semibold">Customer</th>
                  <th className="px-5 py-2.5 font-semibold">Payment</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Items</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((sale) => (
                  <tr key={sale.transactionId} className="hover:bg-surface-2/60">
                    <td className="tabular px-5 py-2.5 font-medium text-text">{sale.billNumber}</td>
                    <td className="px-5 py-2.5 text-text-muted">
                      {asDate(sale)?.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-2.5 text-text-muted">{sale.customerName || "—"}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone="neutral">{sale.paymentMode}</Badge>
                    </td>
                    <td className="tabular px-5 py-2.5 text-right text-text-muted">
                      {(sale.items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right font-semibold">
                      {formatCurrency(sale.grandTotal)}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDetailSale(sale)}>
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate("/billing", { state: { editingBill: sale } })}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="print"
                          disabled={printingKey === sale.transactionId}
                          onClick={() => reprint(sale)}
                        >
                          {printingKey === sale.transactionId ? "…" : "Reprint"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <EmptyState
            title={hasFilters ? "No bills match these filters" : "No sales recorded yet"}
            description={hasFilters ? "Try widening the date range." : "Completed bills appear here."}
            action={hasFilters && <Button variant="secondary" onClick={resetFilters}>Reset filters</Button>}
          />
        )}
      </Card>

      {/* ------------------------------------------------- closed sessions -- */}
      {closedSessions.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Closed sessions" subtitle="Cash-up history" />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Opened</th>
                  <th className="px-5 py-2.5 font-semibold">Closed</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Bills</th>
                  <th className="px-5 py-2.5 font-semibold">Breakdown</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {closedSessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-5 py-2.5 text-text-muted">
                      {new Date(session.startTime).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-2.5 text-text-muted">
                      {session.closedAt ? new Date(session.closedAt).toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right">{session.billCount}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(session.paymentTotals || {}).map(([mode, amount]) => (
                          <Badge key={mode} tone="neutral">
                            {mode} {formatCurrency(amount)}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="tabular px-5 py-2.5 text-right font-semibold">
                      {formatCurrency(session.totalSales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------------- modals -- */}
      <Modal
        open={Boolean(detailSale)}
        onClose={() => setDetailSale(null)}
        title={detailSale?.billNumber ?? ""}
        subtitle={
          detailSale ? new Date(detailSale.createdDate).toLocaleString("en-IN") : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailSale(null)}>
              Close
            </Button>
            <Button icon="print" onClick={() => reprint(detailSale)}>
              Reprint
            </Button>
          </>
        }
      >
        {detailSale && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <p className="text-text-muted">Customer</p>
                <p className="font-medium">{detailSale.customerName || "—"}</p>
              </div>
              <div>
                <p className="text-text-muted">Payment</p>
                <p className="font-medium">{detailSale.paymentMode}</p>
              </div>
              {detailSale.customerMobile && (
                <div>
                  <p className="text-text-muted">Mobile</p>
                  <p className="font-medium">{detailSale.customerMobile}</p>
                </div>
              )}
              {detailSale.soldByName && (
                <div>
                  <p className="text-text-muted">Billed by</p>
                  <p className="font-medium">{detailSale.soldByName}</p>
                </div>
              )}
            </div>

            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="py-2 font-semibold">Item</th>
                  <th className="py-2 text-right font-semibold">Qty</th>
                  <th className="py-2 text-right font-semibold">Price</th>
                  <th className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(detailSale.items || []).map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td className="py-2">{item.name}</td>
                    <td className="tabular py-2 text-right">{item.quantity}</td>
                    <td className="tabular py-2 text-right">{formatCurrency(item.price)}</td>
                    <td className="tabular py-2 text-right font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-text-muted">Subtotal</dt>
                <dd className="tabular">{formatCurrency(detailSale.subtotal)}</dd>
              </div>
              {Number(detailSale.gstAmount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">GST</dt>
                  <dd className="tabular">{formatCurrency(detailSale.gstAmount)}</dd>
                </div>
              )}
              {Number(detailSale.discountAmount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Discount</dt>
                  <dd className="tabular text-success">
                    −{formatCurrency(detailSale.discountAmount)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 font-display text-[16px] font-semibold">
                <dt>Total</dt>
                <dd className="tabular text-primary">{formatCurrency(detailSale.grandTotal)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="End the current sale session?"
        subtitle="Totals are locked in and a fresh session starts immediately."
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>
              Cancel
            </Button>
            <Button onClick={closeSession} disabled={isClosingSession}>
              {isClosingSession ? "Closing…" : "End of sale"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-muted">
          This records the bill count and payment breakdown for the session, then opens a new one.
          Existing bills are not changed.
        </p>
      </Modal>
    </div>
  );
}

export default Reports;
