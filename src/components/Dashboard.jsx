import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  closeCurrentSession,
  getCurrentSession,
  getSalesHistory,
  getSettings,
  saveSelectedBill,
} from "../utils/storage";
import { printThermalReceipt, printerBridgeError } from "../utils/receiptPrinter";
import { formatCurrency } from "../utils/billHelper";

const saleDate = (sale) => {
  const date = new Date(sale.createdDate || sale.saleDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (sale) => {
  const date = saleDate(sale);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "Unknown date";
};

const chartKey = (sale, period) => {
  const date = saleDate(sale);
  if (!date) return "Unknown date";
  if (period === "year") return String(date.getFullYear());
  if (period === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (period === "week") {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
  }
  return dateKey(sale);
};

function Dashboard() {
  const sales = getSalesHistory();
  const navigate = useNavigate();
  const settings = getSettings();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("");
  const [selectedFoodItem, setSelectedFoodItem] = useState("");
  const [printingBillKey, setPrintingBillKey] = useState("");
  const [chartPeriod, setChartPeriod] = useState("day");
  const [currentSession, setCurrentSession] = useState(getCurrentSession());
  const [lastClosedSession, setLastClosedSession] = useState(null);
  const dashboardPassword = import.meta.env.VITE_DASHBOARD_PASSWORD;
  const [passwordInput, setPasswordInput] = useState("");
  const [isDashboardUnlocked, setIsDashboardUnlocked] = useState(!dashboardPassword);
  const today = new Date().toDateString();
  const todaySales = sales.filter((sale) => saleDate(sale)?.toDateString() === today);
  const todayFoodItemCount = todaySales.reduce((total, sale) => total + (sale.items || []).reduce((count, item) => count + Number(item.quantity || 0), 0), 0);
  const totalOrders = sales.length;
  const revenue = sales.reduce((total, sale) => total + Number(sale.grandTotal || 0), 0);
  const todaysSales = todaySales.reduce((total, sale) => total + Number(sale.grandTotal || 0), 0);
  const chartData = Object.values(sales.reduce((dates, sale) => {
    const key = chartKey(sale, chartPeriod);
    if (!dates[key]) dates[key] = { key, count: 0 };
    dates[key].count += (sale.items || []).reduce((count, item) => count + Number(item.quantity || 0), 0);
    return dates;
  }, {})).sort((a, b) => a.key.localeCompare(b.key));
  const maxChartCount = Math.max(...chartData.map((entry) => entry.count), 1);
  const dateOptions = [...new Set(sales.map(dateKey))].sort();
  const paymentModes = [...new Set(sales.map((sale) => sale.paymentMode).filter(Boolean))].sort();
  const foodItems = [...new Set(sales.flatMap((sale) => (sale.items || []).map((item) => item.name)).filter(Boolean))].sort();
  const filteredSales = sales.filter((sale) =>
    (!selectedDate || dateKey(sale) === selectedDate) &&
    (!selectedPaymentMode || sale.paymentMode === selectedPaymentMode) &&
    (!selectedFoodItem || (sale.items || []).some((item) => item.name === selectedFoodItem))
  );
  const currentSessionSales = sales.filter((sale) => {
    const date = saleDate(sale);
    return (
      sale.sessionId === currentSession.id ||
      (!sale.sessionId &&
        date &&
        date.getTime() >= new Date(currentSession.startTime).getTime())
    );
  });
  const currentSessionTotal = currentSessionSales.reduce((total, sale) => total + Number(sale.grandTotal || 0), 0);
  const endSale = () => {
    if (!currentSessionSales.length) {
      alert("No bills in the current sale session.");
      return;
    }

    const confirmed = confirm(
      `End current sale session?\n\nBills: ${currentSessionSales.length}\nTotal: ${formatCurrency(currentSessionTotal)}`
    );

    if (!confirmed) return;

    const result = closeCurrentSession();
    setLastClosedSession(result.closedSession);
    setCurrentSession(result.nextSession);
  };
  const viewReceipt = (sale) => { saveSelectedBill(sale); navigate("/receipt"); };
  const editBill = (sale) => navigate("/billing", { state: { editingBill: sale } });
  const reprintBill = async (sale) => {
    const billKey = `${sale.billNumber}-${sale.createdDate}`;
    setPrintingBillKey(billKey);
    saveSelectedBill(sale);
    try {
      await printThermalReceipt(sale, settings, true);
      navigate("/receipt");
    } catch (error) {
      navigate("/receipt", { state: { printError: printerBridgeError(error) } });
    } finally { setPrintingBillKey(""); }
  };
  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(sales.map((sale) => ({ BillNumber: sale.billNumber, Customer: sale.customerName, Mobile: sale.customerMobile, PaymentMode: sale.paymentMode, Total: sale.grandTotal, Date: sale.saleDate })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");
    XLSX.writeFile(workbook, "sales-report.xlsx");
  };
  const stats = [
    { title: "Today's Sales", value: formatCurrency(todaysSales) },
    { title: "Today's Sales Count", value: todaySales.length },
    { title: "Today's Food Item Count", value: todayFoodItemCount },
    { title: "Total Orders", value: totalOrders },
    { title: "Revenue", value: formatCurrency(revenue) },
  ];

  if (!isDashboardUnlocked) {
    return <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-bold text-slate-800">Dashboard Access</h1><p className="mt-2 text-sm text-slate-500">Enter the configured dashboard password.</p><input type="password" value={passwordInput} onChange={(event) => setPasswordInput(event.target.value)} className="mt-5 w-full rounded-lg border border-slate-300 p-3" /><button onClick={() => setIsDashboardUnlocked(passwordInput === dashboardPassword)} className="mt-4 w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700">Open Dashboard</button></div>;
  }

  return <div>
    <div className="mb-8"><h1 className="text-3xl font-bold text-slate-800">Dashboard</h1><div className="mt-4 flex flex-wrap gap-3"><button onClick={exportToExcel} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">Export Excel</button><button onClick={endSale} className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800">End of Sale</button></div><p className="text-slate-500 mt-2">Overview of your business performance</p>{lastClosedSession && <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">Sale closed at {new Date(lastClosedSession.closedAt).toLocaleString()} · Bills: {lastClosedSession.billCount} · Total: {formatCurrency(lastClosedSession.totalSales)}</p>}</div>
    <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-sm p-5"><h2 className="text-xl font-semibold">Current Sale Session</h2><div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm"><div><p className="text-slate-500">Started</p><p className="font-semibold text-slate-800">{new Date(currentSession.startTime).toLocaleString()}</p></div><div><p className="text-slate-500">Bills</p><p className="font-semibold text-slate-800">{currentSessionSales.length}</p></div><div><p className="text-slate-500">Sales</p><p className="font-semibold text-slate-800">{formatCurrency(currentSessionTotal)}</p></div></div></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">{stats.map((card) => <div key={card.title} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><p className="text-slate-500 text-sm">{card.title}</p><h2 className="text-3xl font-bold mt-3 text-slate-800">{card.value}</h2></div>)}</div>
    <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-5"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="text-xl font-semibold">Food Item Count</h2><p className="text-sm text-slate-500 mt-1">Total quantities sold by selected period</p></div><select value={chartPeriod} onChange={(e) => setChartPeriod(e.target.value)} className="border p-2 rounded-lg"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option></select></div>{chartData.length ? <div className="mt-6 h-64 flex items-end gap-3 overflow-x-auto border-b border-slate-200 pb-6">{chartData.map((entry) => <div key={entry.key} className="h-full min-w-16 flex flex-col justify-end items-center gap-2"><span className="text-xs font-semibold text-slate-700">{entry.count}</span><div className="w-10 rounded-t bg-blue-600" style={{ height: `${Math.max((entry.count / maxChartCount) * 100, 3)}%` }} title={`${entry.key}: ${entry.count} items`} /><span className="text-xs text-slate-500 whitespace-nowrap">{entry.key}</span></div>)}</div> : <p className="mt-5 text-slate-500">No bill data available yet.</p>}</div>
    <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm"><div className="p-5 border-b border-slate-200"><h2 className="text-xl font-semibold">Recent Bills</h2></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-50"><th className="text-left p-4">Bill No</th><th className="text-left p-4">Customer</th><th className="text-left p-4">Payment</th><th className="text-left p-4">Total</th><th className="text-left p-4">Action</th></tr></thead><tbody>{sales.slice().reverse().slice(0, 10).map((sale) => <tr key={`${sale.billNumber}-${sale.createdDate}`}><td className="p-4">{sale.billNumber}</td><td className="p-4">{sale.customerName || "-"}</td><td className="p-4">{sale.paymentMode}</td><td className="p-4 font-semibold text-green-600">{formatCurrency(sale.grandTotal)}</td><td className="p-4"><button onClick={() => viewReceipt(sale)} className="bg-blue-600 text-white px-3 py-1 rounded">View</button></td></tr>)}</tbody></table></div></div>
    <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm"><div className="p-5 border-b border-slate-200"><h2 className="text-xl font-semibold">Bill Gallery</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4"><select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border p-2 rounded-lg"><option value="">All Dates</option>{dateOptions.map((date) => <option key={date}>{date}</option>)}</select><select value={selectedPaymentMode} onChange={(e) => setSelectedPaymentMode(e.target.value)} className="border p-2 rounded-lg"><option value="">All Payment Modes</option>{paymentModes.map((mode) => <option key={mode}>{mode}</option>)}</select><select value={selectedFoodItem} onChange={(e) => setSelectedFoodItem(e.target.value)} className="border p-2 rounded-lg"><option value="">All Food Items</option>{foodItems.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="p-5 space-y-4">{filteredSales.slice().reverse().map((sale) => { const billKey = `${sale.billNumber}-${sale.createdDate}`; return <div key={billKey} className="border border-slate-200 rounded-lg p-4"><div className="flex flex-col md:flex-row md:justify-between gap-3"><div><p className="font-bold text-slate-800">{sale.billNumber}</p><p className="text-sm text-slate-500">{saleDate(sale)?.toLocaleString() || sale.saleDate || "Date unavailable"} · {sale.paymentMode}</p></div><div className="flex gap-2 flex-wrap"><button onClick={() => viewReceipt(sale)} className="bg-blue-600 text-white px-3 py-1 rounded">View</button><button onClick={() => editBill(sale)} className="bg-amber-500 text-white px-3 py-1 rounded">Edit Bill</button><button onClick={() => reprintBill(sale)} disabled={printingBillKey === billKey} className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-60">{printingBillKey === billKey ? "Printing..." : "Reprint"}</button></div></div><div className="overflow-x-auto mt-4"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Food Item</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Item Price</th><th className="py-2 text-right">Item Total</th></tr></thead><tbody>{(sale.items || []).map((item, index) => <tr key={`${item.id || item.name}-${index}`} className="border-b border-slate-100"><td className="py-2">{item.name}</td><td className="py-2 text-right">{item.quantity}</td><td className="py-2 text-right">{formatCurrency(item.price)}</td><td className="py-2 text-right">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</td></tr>)}</tbody><tfoot><tr className="font-bold"><td className="pt-3" colSpan="3">Bill Total</td><td className="pt-3 text-right">{formatCurrency(sale.grandTotal)}</td></tr></tfoot></table></div></div>; })}{!filteredSales.length && <p className="text-slate-500">No bills match the selected filters.</p>}</div></div>
  </div>;
}

export default Dashboard;
