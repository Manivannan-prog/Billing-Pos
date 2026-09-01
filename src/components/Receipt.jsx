import { useState } from "react";
import { useLocation } from "react-router-dom";
import { getSelectedBill, getSettings } from "../utils/storage";
import { printThermalReceipt, printerBridgeError } from "../utils/receiptPrinter";
import { formatCurrency } from "../utils/billHelper";

function Receipt() {
    const bill = getSelectedBill();
    const settings = getSettings();
    const location = useLocation();
    const [printing, setPrinting] = useState(false);
    const [printError, setPrintError] = useState(location.state?.printError || "");

    const retryPrint = async () => {
        if (!bill || printing) return;
        setPrinting(true);
        setPrintError("");
        try {
            await printThermalReceipt(bill, settings, true);
        } catch (error) {
            setPrintError(printerBridgeError(error));
        } finally {
            setPrinting(false);
        }
    };

    if (!bill) {
        return (
            <div className="bg-white p-6 rounded-xl">
                <h1 className="text-2xl font-bold">Receipt Not Found</h1>
                <p className="mt-2 text-slate-500">No bill selected.</p>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto print:w-full">
            <div className="print-receipt bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                {settings.logo && (
                    <div className="flex justify-center mb-3">
                        <img
                            src={settings.logo}
                            alt="Shop Logo"
                            className="h-16 object-contain"
                        />
                    </div>
                )}

                <div className="text-center border-b pb-4 mb-4">
                    <h1 className="text-2xl font-bold">{settings.shopName}</h1>
                    <p className="text-sm mt-2 leading-5">
                        {settings.address || "Address not configured"}
                    </p>
                    {settings.phone && <p className="text-sm mt-1">Ph: {settings.phone}</p>}
                    {settings.gstNumber && <p className="text-sm mt-1">GSTIN: {settings.gstNumber}</p>}
                </div>

                <div className="space-y-2 text-sm">
                    <div>
                        <span className="font-semibold">Bill Number:</span>{" "}
                        {bill.billNumber}
                    </div>
                    <div>
                        <span className="font-semibold">Bill Date:</span>{" "}
                        {bill.createdDate
                            ? new Date(bill.createdDate).toLocaleString()
                            : bill.saleDate}
                    </div>
                    <div>
                        <span className="font-semibold">Payment Mode:</span>{" "}
                        {bill.paymentMode}
                    </div>
                </div>

                <div className="mt-5">
                    <h2 className="text-lg font-bold mb-3">Purchased Items</h2>
                    <table className="w-full border-collapse border text-sm">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="text-left p-2 border">Item</th>
                                <th className="text-center p-2 border">Qty</th>
                                <th className="text-right p-2 border">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(bill.items || []).map((item, index) => (
                                <tr key={`${item.id || item.name}-${index}`} className="border-t">
                                    <td className="p-2 border">{item.name}</td>
                                    <td className="text-center p-2 border">
                                        {item.quantity}
                                    </td>
                                    <td className="text-right p-2 border">
                                        {formatCurrency(item.price * item.quantity)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="mt-4 border-t pt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>{formatCurrency(bill.subtotal)}</span>
                        </div>
                        <div className="border-t pt-3 mt-2 flex justify-between text-xl font-bold">
                            <span>Total</span>
                            <span>{formatCurrency(bill.grandTotal)}</span>
                        </div>
                    </div>

                    <div className="text-center border-t mt-5 pt-4">
                        <p className="font-semibold">THANK YOU</p>
                    </div>

                    <button
                        onClick={retryPrint}
                        disabled={printing}
                        className="print-hidden w-full mt-5 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
                    >
                        {printing ? "Printing..." : "Retry Thermal Print"}
                    </button>
                    {printError && <p className="print-hidden mt-3 text-sm text-red-600">{printError}</p>}
                </div>
            </div>
        </div>
    );
}

export default Receipt;
