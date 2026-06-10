import {
    getSelectedBill,
    getSettings,
} from "../utils/storage";

function Receipt() {
    const bill = getSelectedBill();
    const settings = getSettings();

    if (!bill) {
        return (
            <div className="bg-white p-6 rounded-xl">
                <h1 className="text-2xl font-bold">
                    Receipt Not Found
                </h1>

                <p className="mt-2 text-slate-500">
                    No bill selected.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto print:w-full">
            <div className="print-receipt bg-white rounded-xl shadow-sm border border-slate-200 p-6">

                {settings.logo && (
  <div className="flex justify-center mb-4">
    <img
      src={settings.logo}
      alt="Shop Logo"
      className="h-16 object-contain"
    />
  </div>
)}

<div className="text-center border-b pb-6 mb-6">

                    <h1 className="text-3xl font-bold">
                        {settings.shopName}
                    </h1>

                    {settings.address && (
                        <p className="text-slate-600 mt-2">
                            {settings.address}
                        </p>
                    )}

                    {settings.phone && (
                        <p className="text-slate-600">
                            {settings.phone}
                        </p>
                    )}

                    {settings.gstNumber && (
                        <p className="text-slate-600">
                            GST: {settings.gstNumber}
                        </p>
                    )}

                </div>

                <div className="space-y-3">

                    <div>
                        <span className="font-semibold">
                            Bill Number:
                        </span>{" "}
                        {bill.billNumber}
                    </div>

                    <div>
                        <span className="font-semibold">
                            Customer:
                        </span>{" "}
                        {bill.customerName || "-"}
                    </div>

                    <div>
                        <span className="font-semibold">
                            Mobile:
                        </span>{" "}
                        {bill.customerMobile || "-"}
                    </div>

                    <div>
                        <span className="font-semibold">
                            Payment Mode:
                        </span>{" "}
                        {bill.paymentMode}
                    </div>

                    <div>
                        <span className="font-semibold">
                            Total:
                        </span>{" "}
                        ₹{bill.grandTotal.toFixed(2)}
                    </div>

                </div>
                <div className="mt-8">
                    <h2 className="text-xl font-bold mb-4">
                        Purchased Items
                    </h2>

                    <table className="w-full border">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="text-left p-3">
                                    Item
                                </th>

                                <th className="text-center p-3">
                                    Qty
                                </th>

                                <th className="text-right p-3">
                                    Amount
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {bill.items.map((item) => (
                                <tr
                                    key={item.id}
                                    className="border-t"
                                >
                                    <td className="p-3">
                                        {item.name}
                                    </td>

                                    <td className="text-center p-3">
                                        {item.quantity}
                                    </td>

                                    <td className="text-right p-3">
                                        ₹{(
                                            item.price *
                                            item.quantity
                                        ).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="mt-8 border-t pt-6 space-y-3">

                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>
                                ₹{bill.subtotal.toFixed(2)}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span>GST</span>
                            <span>
                                ₹{bill.gstAmount.toFixed(2)}
                            </span>
                        </div>

                        <div className="flex justify-between text-red-600">
                            <span>Discount</span>
                            <span>
                                -₹{bill.discountAmount.toFixed(2)}
                            </span>
                        </div>

                        <div className="border-t pt-3 flex justify-between text-2xl font-bold">
                            <span>Total</span>

                            <span>
                                ₹{bill.grandTotal.toFixed(2)}
                            </span>
                        </div>
                        <div className="text-center border-t mt-8 pt-6">
                            <p className="font-semibold">
                                Thank You Visit Again
                            </p>
                        </div>
                        <button
                            onClick={() => window.print()}
                            className="print-hidden w-full mt-6 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
                        >
                            Print Receipt
                        </button>

                    </div>
                </div>

            </div>
        </div>
    );
}

export default Receipt;