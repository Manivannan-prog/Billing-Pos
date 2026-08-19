import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getSettings,
  getCurrentBillNumber,
incrementBillNumber,
  getMenuItems,
  saveSale,
  saveSelectedBill,
} from "../utils/storage";
import { printThermalReceipt, printerBridgeError } from "../utils/receiptPrinter";

function Billing() {
    const navigate = useNavigate();
    const [cart, setCart] = useState([]);
    const [customerName, setCustomerName] = useState("");
    const [customerMobile, setCustomerMobile] = useState("");
    const [paymentMode, setPaymentMode] = useState("Cash");
    const [isCompleting, setIsCompleting] = useState(false);
    const [printError, setPrintError] = useState("");
   const [billNumber, setBillNumber] = useState(
  getCurrentBillNumber()

);
    const settings = getSettings();
    const menuItems = getMenuItems();

    const addToCart = (item) => {
        const existingItem = cart.find(
            (cartItem) => cartItem.id === item.id
        );

        if (existingItem) {
            const updatedCart = cart.map((cartItem) =>
                cartItem.id === item.id
                    ? {
                        ...cartItem,
                        quantity: cartItem.quantity + 1,
                    }
                    : cartItem
            );

            setCart(updatedCart);
        } else {
            setCart([
                ...cart,
                {
                    ...item,
                    quantity: 1,
                },
            ]);
        }
    };

    const increaseQuantity = (id) => {
        setCart(
            cart.map((item) =>
                item.id === id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            )
        );
    };

    const decreaseQuantity = (id) => {
        const updatedCart = cart
            .map((item) =>
                item.id === id
                    ? { ...item, quantity: item.quantity - 1 }
                    : item
            )
            .filter((item) => item.quantity > 0);

        setCart(updatedCart);
    };

    const removeItem = (id) => {
        setCart(cart.filter((item) => item.id !== id));
    };
    const handleCompleteSale = async () => {
  if (isCompleting) return;
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const bill = {
    billNumber,
    customerName,
    customerMobile,
    paymentMode,

    items: cart,

    subtotal,
    gstAmount,
    discountAmount,
    grandTotal,

    createdDate: new Date().toISOString(),
saleDate: new Date().toLocaleString(),
  };

  setIsCompleting(true);
  setPrintError("");
  try {
    saveSale(bill);
    saveSelectedBill(bill);

    setCart([]);
    setCustomerName("");
    setCustomerMobile("");
    setPaymentMode("Cash");

    setBillNumber(incrementBillNumber());
    let printingError = "";
    try {
      await printThermalReceipt(bill, settings);
    } catch (error) {
      printingError = printerBridgeError(error);
      setPrintError(printingError);
    }

    navigate("/receipt", { state: { printError: printingError } });
  } finally {
    setIsCompleting(false);
  }
};
    const subtotal = cart.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );

    const gstAmount = settings.enableGST
        ? (subtotal * Number(settings.gstPercentage || 0)) / 100
        : 0;

    const discountAmount = settings.enableDiscount
        ? (subtotal * Number(settings.discountPercentage || 0)) / 100
        : 0;

    const grandTotal =
        subtotal + gstAmount - discountAmount;

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800">
                    Billing
                </h1>

                <p className="mt-3 font-semibold text-blue-600">
                    Cart Items: {cart.length}
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Product Section */}

                <div className="xl:col-span-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {menuItems.map((item) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5"
                            >
                                <h3 className="text-lg font-semibold text-slate-800">
                                    {item.name}
                                </h3>

                                <p className="text-slate-500 text-sm mt-1">
                                    {item.category}
                                </p>

                                <div className="flex items-center justify-between mt-4">
                                    <span className="font-bold text-xl text-green-600">
                                        ₹{item.price}
                                    </span>

                                    <button
                                        onClick={() => addToCart(item)}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Cart Section */}

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-fit">
                    <h2 className="text-xl font-bold mb-4">
                        Cart
                    </h2>
                    <div className="bg-slate-100 p-3 rounded-lg mb-4">
                        <p className="text-sm text-slate-500">
                            Bill Number
                        </p>

                        <p className="font-bold text-lg">
                            {billNumber}
                        </p>
                    </div>
                    <div className="space-y-3 mb-5">

                        <input
                            type="text"
                            placeholder="Customer Name"
                            value={customerName}
                            onChange={(e) =>
                                setCustomerName(e.target.value)
                            }
                            className="w-full border p-3 rounded-lg"
                        />

                        <input
                            type="text"
                            placeholder="Customer Mobile"
                            value={customerMobile}
                            onChange={(e) =>
                                setCustomerMobile(e.target.value)
                            }
                            className="w-full border p-3 rounded-lg"
                        />

                        <select
                            value={paymentMode}
                            onChange={(e) =>
                                setPaymentMode(e.target.value)
                            }
                            className="w-full border p-3 rounded-lg"
                        >
                            <option>Cash</option>
                            <option>UPI</option>
                            <option>Card</option>
                        </select>

                    </div>

                    {cart.length === 0 ? (
                        <p className="text-slate-500">
                            No items added
                        </p>
                    ) : (
                        cart.map((item) => (
                            <div
                                key={item.id}
                                className="border-b border-slate-200 py-3"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold">
                                            {item.name}
                                        </p>

                                        <p className="text-green-600 font-medium">
                                            ₹{item.price}
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="text-red-500 text-sm"
                                    >
                                        Remove
                                    </button>
                                </div>

                                <div className="flex items-center gap-3 mt-3">
                                    <button
                                        onClick={() => decreaseQuantity(item.id)}
                                        className="w-8 h-8 bg-slate-200 rounded"
                                    >
                                        -
                                    </button>

                                    <span className="font-semibold">
                                        {item.quantity}
                                    </span>

                                    <button
                                        onClick={() => increaseQuantity(item.id)}
                                        className="w-8 h-8 bg-slate-200 rounded"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                    <div className="mt-5 pt-4 border-t border-slate-200 space-y-2">

                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>₹{subtotal.toFixed(2)}</span>
                        </div>

                        {settings.enableGST && (
                            <div className="flex justify-between">
                                <span>
                                    GST ({settings.gstPercentage}%)
                                </span>
                                <span>
                                    ₹{gstAmount.toFixed(2)}
                                </span>
                            </div>
                        )}

                        {settings.enableDiscount && (
                            <div className="flex justify-between text-red-600">
                                <span>
                                    Discount ({settings.discountPercentage}%)
                                </span>
                                <span>
                                    -₹{discountAmount.toFixed(2)}
                                </span>
                            </div>
                        )}

                        <div className="border-t pt-3 mt-3 flex justify-between text-xl font-bold">
                            <span>Total</span>
                            <span>
                                ₹{grandTotal.toFixed(2)}
                            </span>
                        </div>
                        <button
  onClick={handleCompleteSale}
  disabled={isCompleting}
  className="w-full mt-4 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
>
  {isCompleting ? "Saving & Printing..." : "Complete Sale"}
</button>
                    {printError && <p className="mt-3 text-sm text-red-600">{printError}</p>}

                    </div>
                </div>
            </div>
        </div>
    );
}

export default Billing;
