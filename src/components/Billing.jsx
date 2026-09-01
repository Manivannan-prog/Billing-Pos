import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getSettings,
  getCurrentBillNumber,
  incrementBillNumber,
  getMenuItems,
  getCurrentSession,
  applyBillingItemOrder,
  saveBillingItemOrder,
  saveSale,
  updateSale,
  saveSelectedBill,
  queueSaleForSync,
  syncPendingSales,
} from "../utils/storage";
import { printThermalReceipt, printerBridgeError } from "../utils/receiptPrinter";
import { formatCurrency } from "../utils/billHelper";

const createTransactionId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();

  return `TXN-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function Billing() {
  const navigate = useNavigate();
  const location = useLocation();
  const editingBill = location.state?.editingBill;
  const settings = getSettings();
  const currentSession = getCurrentSession();
  const savedMenuItems = getMenuItems();
  const initialMenuItems = applyBillingItemOrder(savedMenuItems);

  const [cart, setCart] = useState(editingBill?.items || []);
  const [customerName, setCustomerName] = useState(editingBill?.customerName || "");
  const [customerMobile, setCustomerMobile] = useState(editingBill?.customerMobile || "");
  const [paymentMode, setPaymentMode] = useState(editingBill?.paymentMode || "Cash");
  const [collectedAmount, setCollectedAmount] = useState(
    editingBill?.collectedAmount ?? ""
  );
  const [isCompleting, setIsCompleting] = useState(false);
  const [printError, setPrintError] = useState("");
  const [billNumber, setBillNumber] = useState(
    editingBill?.billNumber || getCurrentBillNumber()
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isOrderEditing, setIsOrderEditing] = useState(false);
  const [orderedMenuItems, setOrderedMenuItems] = useState(initialMenuItems);
  const [draggedItemId, setDraggedItemId] = useState(null);

  const categories = useMemo(
    () => ["All", ...new Set(orderedMenuItems.map((item) => item.category).filter(Boolean))],
    [orderedMenuItems]
  );

  const visibleMenuItems = orderedMenuItems.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase());
    const matchesCategory =
      selectedCategory === "All" || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const addToCart = (item) => {
    if (isOrderEditing) return;

    const existingItem = cart.find((cartItem) => cartItem.id === item.id);

    if (existingItem) {
      setCart(
        cart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        )
      );
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const increaseQuantity = (id) => {
    setCart(
      cart.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  const decreaseQuantity = (id) => {
    setCart(
      cart
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (id) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const moveBillingItem = (targetItemId) => {
    if (!draggedItemId || draggedItemId === targetItemId) return;

    const nextItems = [...orderedMenuItems];
    const draggedIndex = nextItems.findIndex((item) => item.id === draggedItemId);
    const targetIndex = nextItems.findIndex((item) => item.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedItem] = nextItems.splice(draggedIndex, 1);
    nextItems.splice(targetIndex, 0, draggedItem);
    setOrderedMenuItems(nextItems);
  };

  const saveDisplayOrder = () => {
    saveBillingItemOrder(orderedMenuItems.map((item) => item.id));
    setIsOrderEditing(false);
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
  const grandTotal = subtotal + gstAmount - discountAmount;
  const balanceAmount = (Number(collectedAmount) || 0) - grandTotal;

  const handleCompleteSale = async () => {
    if (isCompleting) return;
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    const saleTime = new Date();
    const bill = {
      billNumber,
      transactionId: editingBill?.transactionId || createTransactionId(),
      sessionId: editingBill?.sessionId || currentSession.id,
      customerName,
      customerMobile,
      paymentMode,
      items: cart,
      subtotal,
      gstAmount,
      discountAmount,
      grandTotal,
      createdDate: saleTime.toISOString(),
      saleDate: saleTime.toLocaleString(),
      collectedAmount: collectedAmount === "" ? grandTotal : Number(collectedAmount),
    };

    if (editingBill) {
      bill.createdDate = editingBill.createdDate;
      bill.saleDate =
        editingBill.saleDate || new Date(editingBill.createdDate).toLocaleString();
    }

    setIsCompleting(true);
    setPrintError("");

    try {
      if (editingBill) {
        updateSale(bill);
      } else {
        saveSale(bill);
      }

      queueSaleForSync(bill);
      saveSelectedBill(bill);

      setCart([]);
      setCustomerName("");
      setCustomerMobile("");
      setPaymentMode("Cash");
      setCollectedAmount("");

      if (!editingBill) {
        setBillNumber(incrementBillNumber());
      }

      try {
        await printThermalReceipt(bill, settings, Boolean(editingBill));
      } catch (error) {
        setPrintError(printerBridgeError(error));
      }

      syncPendingSales();
      navigate("/billing", { replace: true });
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {editingBill ? `Edit ${editingBill.billNumber}` : "Billing"}
          </h1>
          <p className="mt-1 text-sm font-semibold text-blue-600">
            Cart Items: {cart.length}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isOrderEditing ? (
            <>
              <button
                onClick={saveDisplayOrder}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Save Order
              </button>
              <button
                onClick={() => {
                  setOrderedMenuItems(initialMenuItems);
                  setIsOrderEditing(false);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsOrderEditing(true)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit Item Order
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <input
              type="search"
              placeholder="Search items fast"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                    selectedCategory === category
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {visibleMenuItems.map((item) => (
              <button
                key={item.id}
                draggable={isOrderEditing}
                onDragStart={() => setDraggedItemId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveBillingItem(item.id)}
                onDragEnd={() => setDraggedItemId(null)}
                onClick={() => addToCart(item)}
                className={`min-h-28 rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                  isOrderEditing
                    ? "cursor-grab border-amber-300 ring-1 ring-amber-100"
                    : "border-slate-200 hover:border-blue-300 hover:shadow-md"
                }`}
              >
                <span className="block text-sm font-bold text-slate-800">
                  {item.name}
                </span>
                <span className="mt-2 block text-xs text-slate-500">
                  {item.category}
                </span>
                <span className="mt-3 block text-base font-bold text-green-600">
                  {formatCurrency(item.price)}
                </span>
                {isOrderEditing && (
                  <span className="mt-2 block text-xs font-semibold text-amber-600">
                    Drag to reorder
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Cart</h2>
          <div className="mb-4 rounded-lg bg-slate-100 p-3">
            <p className="text-sm text-slate-500">Bill Number</p>
            <p className="text-lg font-bold">{billNumber}</p>
          </div>

          <div className="mb-5 space-y-3">
            <input
              type="text"
              placeholder="Customer Name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="w-full rounded-lg border p-3"
            />
            <input
              type="text"
              placeholder="Customer Mobile"
              value={customerMobile}
              onChange={(event) => setCustomerMobile(event.target.value)}
              className="w-full rounded-lg border p-3"
            />

            <div className="grid grid-cols-2 gap-2">
              {["Cash", "UPI"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`rounded-lg border px-4 py-3 text-sm font-bold ${
                    paymentMode === mode
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {cart.length === 0 ? (
            <p className="text-slate-500">No items added</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="border-b border-slate-200 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="font-medium text-green-600">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-sm text-red-500"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => decreaseQuantity(item.id)}
                    className="h-8 w-8 rounded bg-slate-200"
                  >
                    -
                  </button>
                  <span className="font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => increaseQuantity(item.id)}
                    className="h-8 w-8 rounded bg-slate-200"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {settings.enableGST && (
              <div className="flex justify-between">
                <span>GST ({settings.gstPercentage}%)</span>
                <span>{formatCurrency(gstAmount)}</span>
              </div>
            )}
            {settings.enableDiscount && (
              <div className="flex justify-between text-red-600">
                <span>Discount ({settings.discountPercentage}%)</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t pt-3 text-xl font-bold">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            <div className="print-hidden mt-5 space-y-3 border-t pt-4">
              <h3 className="font-semibold text-slate-800">Collection</h3>
              <div className="flex justify-between text-sm">
                <span>Total Bill Amount</span>
                <span className="font-semibold">{formatCurrency(grandTotal)}</span>
              </div>
              <label className="block text-sm text-slate-600">
                Collected Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectedAmount}
                  onChange={(event) => setCollectedAmount(event.target.value)}
                  placeholder={grandTotal.toFixed(2)}
                  className="mt-1 w-full rounded-lg border p-2"
                />
              </label>
              <div className="flex justify-between text-sm">
                <span>Balance Amount</span>
                <span className="font-semibold">{formatCurrency(balanceAmount)}</span>
              </div>
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={isCompleting}
              className="mt-4 w-full rounded-lg bg-green-600 py-3 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {isCompleting
                ? "Saving & Printing..."
                : editingBill
                  ? "Save Changes & Print"
                  : "Complete Sale"}
            </button>
            {printError && <p className="mt-3 text-sm text-red-600">{printError}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Billing;
