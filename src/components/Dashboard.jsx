import { getSalesHistory } from "../utils/storage";
import { useNavigate } from "react-router-dom";
import { saveSelectedBill } from "../utils/storage";
import * as XLSX from "xlsx";

function Dashboard() {
    const sales = getSalesHistory();


    const totalOrders = sales.length;

    const revenue = sales.reduce(
        (total, sale) => total + sale.grandTotal,
        0
    );

    const today = new Date().toDateString();
    const navigate = useNavigate();
    const viewReceipt = (sale) => {
        saveSelectedBill(sale);
        navigate("/receipt");
    };
    const todaysSales = sales
        .filter(
            (sale) =>
                new Date(sale.createdDate).toDateString() === today
        )
        .reduce(
            (total, sale) => total + sale.grandTotal,
            0
        );

    const stats = [
        {
            title: "Today's Sales",
            value: `₹${todaysSales.toFixed(2)}`,
        },
        {
            title: "Total Orders",
            value: totalOrders,
        },
        {
            title: "Revenue",
            value: `₹${revenue.toFixed(2)}`,
        },
        {
            title: "Top Item",
            value: "Coming Soon",
        },
    ];
    const exportToExcel = () => {
  const reportData = sales.map((sale) => ({
    BillNumber: sale.billNumber,
    Customer: sale.customerName,
    Mobile: sale.customerMobile,
    PaymentMode: sale.paymentMode,
    Total: sale.grandTotal,
    Date: sale.saleDate,
  }));

  const worksheet =
    XLSX.utils.json_to_sheet(reportData);

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Sales"
  );

  XLSX.writeFile(
    workbook,
    "sales-report.xlsx"
  );
};

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800">
                    Dashboard
                </h1>
                <button
  onClick={exportToExcel}
  className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
>
  Export Excel
</button>

                <p className="text-slate-500 mt-2">
                    Overview of your business performance
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {stats.map((card) => (
                    <div
                        key={card.title}
                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                    >
                        <p className="text-slate-500 text-sm">
                            {card.title}
                        </p>

                        <h2 className="text-3xl font-bold mt-3 text-slate-800">
                            {card.value}
                        </h2>
                    </div>
                ))}
            </div>
            <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="p-5 border-b border-slate-200">
                    <h2 className="text-xl font-semibold">
                        Recent Bills
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="text-left p-4">
                                    Bill No
                                </th>

                                <th className="text-left p-4">
                                    Customer
                                </th>

                                <th className="text-left p-4">
                                    Payment
                                </th>

                                <th className="text-left p-4">
                                    Total
                                </th>

                                <th className="text-left p-4">
                                    Action
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {sales
                                .slice()
                                .reverse()
                                .slice(0, 10)
                                .map((sale) => (
                                    <tr
                                        key={`${sale.billNumber}-${sale.createdDate}`}
                                    >
                                        <td className="p-4">
                                            {sale.billNumber}
                                        </td>

                                        <td className="p-4">
                                            {sale.customerName || "-"}
                                        </td>

                                        <td className="p-4">
                                            {sale.paymentMode}
                                        </td>

                                        <td className="p-4 font-semibold text-green-600">
                                            ₹{sale.grandTotal.toFixed(2)}
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={() => viewReceipt(sale)}
                                                className="bg-blue-600 text-white px-3 py-1 rounded"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;