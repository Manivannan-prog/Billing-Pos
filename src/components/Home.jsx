import { getSalesHistory } from "../utils/storage";
import { formatCurrency } from "../utils/billHelper";

const getSaleDate = (sale) => {
  const date = new Date(sale.createdDate || sale.saleDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

function Home() {
  const sales = getSalesHistory();
  const todayKey = getDateKey(new Date());
  const todaySales = sales.filter((sale) => {
    const date = getSaleDate(sale);
    return date && getDateKey(date) === todayKey;
  });
  const todayRevenue = todaySales.reduce(
    (total, sale) => total + Number(sale.grandTotal || 0),
    0
  );
  const itemTotals = Object.values(
    sales.reduce((items, sale) => {
      (sale.items || []).forEach((item) => {
        const name = item.name || "Unknown";
        items[name] = items[name] || { name, quantity: 0 };
        items[name].quantity += Number(item.quantity || 0);
      });

      return items;
    }, {})
  )
    .sort((first, second) => second.quantity - first.quantity)
    .slice(0, 5);
  const paymentTotals = Object.entries(
    todaySales.reduce((payments, sale) => {
      const mode = sale.paymentMode || "Unknown";
      payments[mode] = (payments[mode] || 0) + Number(sale.grandTotal || 0);
      return payments;
    }, {})
  );
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = getDateKey(date);
    const amount = sales.reduce((total, sale) => {
      const saleDate = getSaleDate(sale);
      return saleDate && getDateKey(saleDate) === key
        ? total + Number(sale.grandTotal || 0)
        : total;
    }, 0);

    return { key, label: date.toLocaleDateString("en-IN", { weekday: "short" }), amount };
  });
  const maxDaySales = Math.max(...lastSevenDays.map((day) => day.amount), 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          Welcome to Billing Software
        </h1>
        <p className="mt-2 text-slate-600">Biriyani POS Management System</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Today's Sales</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {formatCurrency(todayRevenue)}
          </h2>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Today's Bills</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {todaySales.length}
          </h2>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Bills Saved</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {sales.length}
          </h2>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-semibold text-slate-800">Weekly Sales</h2>
          <div className="mt-5 flex h-44 items-end gap-3 border-b border-slate-200 pb-4">
            {lastSevenDays.map((day) => (
              <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  {day.amount ? formatCurrency(day.amount) : "-"}
                </span>
                <div
                  className="w-full max-w-14 rounded-t bg-blue-600"
                  style={{ height: `${Math.max((day.amount / maxDaySales) * 100, 4)}%` }}
                />
                <span className="text-xs text-slate-500">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Payment Breakdown</h2>
          <div className="mt-4 space-y-3">
            {paymentTotals.length ? (
              paymentTotals.map(([mode, amount]) => (
                <div key={mode} className="flex justify-between text-sm">
                  <span>{mode}</span>
                  <span className="font-semibold">{formatCurrency(amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No payments today yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Top-selling Items</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {itemTotals.length ? (
            itemTotals.map((item) => (
              <div key={item.name} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">{item.name}</p>
                <p className="mt-1 text-sm text-slate-500">{item.quantity} sold</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No item sales yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
