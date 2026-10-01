import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { menu as menuApi, sales as salesApi, sessions as sessionsApi } from "../lib/db";
import { useShop } from "../lib/shop";
import { formatCurrency } from "../utils/billHelper";
import { checkBridge, printReceipt } from "../utils/receiptPrinter";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Spinner,
} from "../components/ui";

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Other"];

const createTransactionId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `TXN-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * The order panel. Rendered twice: as a sticky column on wide screens, and
 * inside a bottom sheet on phones, so a till is usable one-handed.
 */
function OrderPanel({
  cart,
  changeQuantity,
  removeLine,
  clearCart,
  customerName,
  setCustomerName,
  customerMobile,
  setCustomerMobile,
  paymentMode,
  setPaymentMode,
  collectedAmount,
  setCollectedAmount,
  settings,
  subtotal,
  gstAmount,
  discountAmount,
  grandTotal,
  balance,
  isCompleting,
  onComplete,
  editingBill,
  onClose,
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5 sm:py-4">
        <h2 className="font-display text-[17px] font-semibold text-text">Current order</h2>
        <div className="flex items-center gap-1">
          {cart.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clearCart}>
              Clear
            </Button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close order"
              className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text xl:hidden"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {cart.length ? (
          <div className="divide-y divide-border">
            {cart.map((line) => (
              <div key={line.id} className="flex items-start gap-2 px-4 py-3 sm:gap-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{line.name}</p>
                  <p className="tabular mt-0.5 text-[12px] text-text-muted">
                    {formatCurrency(line.price)} each
                  </p>
                </div>

                <div className="flex items-center rounded-lg border border-border">
                  <button
                    onClick={() => changeQuantity(line.id, -1)}
                    aria-label={`Reduce ${line.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-l-lg text-text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Icon name="minus" className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular w-7 text-center text-sm font-semibold">
                    {line.quantity}
                  </span>
                  <button
                    onClick={() => changeQuantity(line.id, 1)}
                    aria-label={`Add ${line.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-r-lg text-text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Icon name="plus" className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="w-[74px] shrink-0 text-right">
                  <p className="tabular text-sm font-semibold text-text">
                    {formatCurrency(line.price * line.quantity)}
                  </p>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="mt-0.5 text-[11px] text-text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="billing"
            title="No items yet"
            description="Tap an item tile to start this bill."
          />
        )}
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer">
            <Input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Mobile">
            <Input
              value={customerMobile}
              onChange={(event) => setCustomerMobile(event.target.value)}
              placeholder="Optional"
              inputMode="tel"
            />
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Payment">
            <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
              {PAYMENT_MODES.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </Select>
          </Field>
          <Field label="Collected">
            <Input
              value={collectedAmount}
              onChange={(event) => setCollectedAmount(event.target.value)}
              placeholder={grandTotal.toFixed(2)}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
            />
          </Field>
        </div>

        <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-text-muted">Subtotal</dt>
            <dd className="tabular font-medium">{formatCurrency(subtotal)}</dd>
          </div>
          {settings.enableGST && (
            <div className="flex justify-between">
              <dt className="text-text-muted">GST ({settings.gstPercentage}%)</dt>
              <dd className="tabular font-medium">{formatCurrency(gstAmount)}</dd>
            </div>
          )}
          {settings.enableDiscount && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Discount ({settings.discountPercentage}%)</dt>
              <dd className="tabular font-medium text-success">
                −{formatCurrency(discountAmount)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-border pt-2.5">
            <dt className="font-display text-[15px] font-semibold">Total</dt>
            <dd className="tabular font-display text-[22px] font-semibold text-primary">
              {formatCurrency(grandTotal)}
            </dd>
          </div>
          {collectedAmount !== "" && (
            <div className="flex justify-between pt-1">
              <dt className="text-text-muted">{balance >= 0 ? "Change due" : "Short by"}</dt>
              <dd className={`tabular font-semibold ${balance < 0 ? "text-danger" : "text-text"}`}>
                {formatCurrency(Math.abs(balance))}
              </dd>
            </div>
          )}
        </dl>

        <Button
          size="lg"
          onClick={onComplete}
          disabled={isCompleting || !cart.length}
          className="mt-4 w-full"
        >
          {isCompleting ? <Spinner className="h-4 w-4" /> : <Icon name="print" className="h-4 w-4" />}
          {isCompleting
            ? "Saving…"
            : editingBill
              ? "Update & reprint"
              : `Complete sale · ${formatCurrency(grandTotal)}`}
        </Button>
      </div>
    </>
  );
}

function Billing() {
  const navigate = useNavigate();
  const location = useLocation();
  const editingBill = location.state?.editingBill ?? null;

  const { settings, menuItems, reload: reloadShop } = useShop();

  const [cart, setCart] = useState(editingBill?.items ?? []);
  const [customerName, setCustomerName] = useState(editingBill?.customerName ?? "");
  const [customerMobile, setCustomerMobile] = useState(editingBill?.customerMobile ?? "");
  const [paymentMode, setPaymentMode] = useState(editingBill?.paymentMode ?? "Cash");
  const [collectedAmount, setCollectedAmount] = useState(editingBill?.collectedAmount ?? "");

  const [billNumber, setBillNumber] = useState(editingBill?.billNumber ?? "");
  const [session, setSession] = useState(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [notice, setNotice] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  // Non-null only while the user is dragging tiles around; otherwise the menu
  // from ShopProvider is the single source of truth.
  const [orderDraft, setOrderDraft] = useState(null);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [isBridgeUp, setIsBridgeUp] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await sessionsApi.current();
        if (!cancelled) setSession(current);

        if (!editingBill) {
          // Preview only. The number is claimed when the sale is saved, so
          // opening the till without selling leaves no gap in the bill series.
          const preview = await salesApi.peekBillNumber();
          if (!cancelled) setBillNumber(preview);
        }
      } catch (error) {
        if (!cancelled) setNotice({ tone: "danger", text: error.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingBill]);

  useEffect(() => {
    checkBridge().then(setIsBridgeUp);
  }, []);

  const isOrderEditing = orderDraft !== null;
  const displayItems = orderDraft ?? menuItems;

  const categories = useMemo(
    () => ["All", "Favorites", ...new Set(displayItems.map((item) => item.category).filter(Boolean))],
    [displayItems],
  );

  const visibleItems = displayItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
    const matchesCategory =
      selectedCategory === "All" ||
      (selectedCategory === "Favorites" ? item.isFavorite : item.category === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  /* ------------------------------------------------------------- cart ---- */

  const addToCart = (item) => {
    if (isOrderEditing) return;
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      return existing
        ? current.map((line) =>
            line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...current, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const changeQuantity = (id, delta) =>
    setCart((current) =>
      current
        .map((line) => (line.id === id ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );

  const removeLine = (id) => setCart((current) => current.filter((line) => line.id !== id));

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerMobile("");
    setPaymentMode("Cash");
    setCollectedAmount("");
  };

  const toggleFavorite = async (item) => {
    try {
      await menuApi.setFavorite(item.id, !item.isFavorite);
      await reloadShop();
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    }
  };

  /* --------------------------------------------------------- reordering -- */

  const moveItem = (targetId) => {
    if (!draggedItemId || draggedItemId === targetId) return;
    setOrderDraft((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === draggedItemId);
      const to = next.findIndex((item) => item.id === targetId);
      if (from === -1 || to === -1) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const saveDisplayOrder = async () => {
    try {
      await menuApi.saveOrder(orderDraft.map((item) => item.id));
      await reloadShop();
      setOrderDraft(null);
      setNotice({ tone: "success", text: "Tile order saved." });
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    }
  };

  /* ------------------------------------------------------------ totals --- */

  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const gstAmount = settings.enableGST ? (subtotal * Number(settings.gstPercentage || 0)) / 100 : 0;
  const discountAmount = settings.enableDiscount
    ? (subtotal * Number(settings.discountPercentage || 0)) / 100
    : 0;
  const grandTotal = subtotal + gstAmount - discountAmount;
  const balance = (Number(collectedAmount) || 0) - grandTotal;
  const cartCount = cart.reduce((count, line) => count + line.quantity, 0);

  /* -------------------------------------------------------- completion --- */

  const handleCompleteSale = async () => {
    if (isCompleting) return;
    if (!cart.length) {
      setNotice({ tone: "warning", text: "Add at least one item before completing the sale." });
      return;
    }

    setIsCompleting(true);
    setNotice(null);

    // Claim the bill number now rather than when the screen opened, so an
    // abandoned cart never consumes one.
    let issuedNumber = editingBill?.billNumber ?? billNumber;
    if (!editingBill) {
      try {
        issuedNumber = await salesApi.nextBillNumber();
        setBillNumber(issuedNumber);
      } catch (error) {
        setIsCompleting(false);
        setNotice({ tone: "danger", text: `Could not reserve a bill number: ${error.message}` });
        return;
      }
    }

    const saleTime = editingBill ? new Date(editingBill.createdDate) : new Date();
    const bill = {
      id: editingBill?.id,
      billNumber: issuedNumber,
      transactionId: editingBill?.transactionId || createTransactionId(),
      sessionId: editingBill?.sessionId || session?.id || null,
      customerName,
      customerMobile,
      paymentMode,
      items: cart,
      subtotal,
      gstAmount,
      discountAmount,
      grandTotal,
      collectedAmount: collectedAmount === "" ? grandTotal : Number(collectedAmount),
      createdDate: saleTime.toISOString(),
    };

    try {
      const saved = editingBill ? await salesApi.update(bill) : await salesApi.create(bill);

      let printResult;
      try {
        printResult = await printReceipt({ ...bill, ...saved }, settings, Boolean(editingBill));
      } catch (printError) {
        printResult = { failed: printError.message };
      }

      clearCart();
      setIsSheetOpen(false);
      if (!editingBill) {
        // The sale is saved by now. Failing to fetch the next preview number
        // must not fall through to "The sale was not saved" below.
        salesApi
          .peekBillNumber()
          .then(setBillNumber)
          .catch(() => setBillNumber(""));
      }

      // The sale is already saved at this point, so a printer problem is a
      // warning about the receipt, never a lost bill.
      if (printResult?.failed) {
        setIsBridgeUp(false);
        setNotice({
          tone: "warning",
          text: `${issuedNumber} saved, but not printed. ${printResult.failed}`,
        });
      } else {
        setIsBridgeUp(true);
        setNotice({ tone: "success", text: `${issuedNumber} completed and printed.` });
      }

      if (editingBill) navigate("/reports", { replace: true });
      searchRef.current?.focus();
    } catch (error) {
      setNotice({ tone: "danger", text: `The sale was not saved: ${error.message}` });
    } finally {
      setIsCompleting(false);
    }
  };

  const panelProps = {
    cart,
    changeQuantity,
    removeLine,
    clearCart,
    customerName,
    setCustomerName,
    customerMobile,
    setCustomerMobile,
    paymentMode,
    setPaymentMode,
    collectedAmount,
    setCollectedAmount,
    settings,
    subtotal,
    gstAmount,
    discountAmount,
    grandTotal,
    balance,
    isCompleting,
    onComplete: handleCompleteSale,
    editingBill,
  };

  /* -------------------------------------------------------------- view --- */

  return (
    <div>
      {notice && (
        <Alert
          tone={notice.tone}
          icon={notice.tone === "success" ? "check" : "alert"}
          className="mb-4"
        >
          {notice.text}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        {/* ---------------------------------------------------- item grid -- */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-[22px] font-semibold leading-tight text-text sm:text-[24px]">
                {editingBill ? `Editing ${editingBill.billNumber}` : "Billing"}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
                <span className="tabular">{billNumber || "…"}</span>
                {isBridgeUp === true && <Badge tone="success">Printer bridge online</Badge>}
                {isBridgeUp === false && <Badge tone="warning">Printer offline</Badge>}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isOrderEditing ? (
                <>
                  <Button size="sm" icon="check" onClick={saveDisplayOrder}>
                    Save order
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setOrderDraft(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <span className="hidden sm:block">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="edit"
                    onClick={() => setOrderDraft(menuItems)}
                  >
                    Arrange tiles
                  </Button>
                </span>
              )}
            </div>
          </div>

          <Card className="mb-4 p-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                />
                <Input
                  ref={searchRef}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search items…"
                  className="pl-9"
                />
              </div>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin sm:mx-0 sm:px-0 sm:pb-0">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`h-10 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                      selectedCategory === category
                        ? "bg-primary text-white"
                        : "border border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {isOrderEditing && (
            <Alert tone="info" icon="edit" className="mb-3">
              Drag a tile onto another to change where it sits, then save.
            </Alert>
          )}

          {visibleItems.length ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  draggable={isOrderEditing}
                  onDragStart={() => setDraggedItemId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    moveItem(item.id);
                    setDraggedItemId(null);
                  }}
                  className={`group relative rounded-[14px] border bg-surface p-3 text-left transition-all sm:p-4 ${
                    isOrderEditing
                      ? "cursor-grab border-dashed border-primary/40"
                      : "border-border active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:border-primary/30 sm:hover:shadow-[0_10px_15px_-3px_rgb(31_36_33/0.08)]"
                  }`}
                >
                  <button
                    onClick={() => toggleFavorite(item)}
                    aria-label={item.isFavorite ? "Remove from favourites" : "Add to favourites"}
                    className={`absolute right-1 top-1 rounded-md p-1.5 transition-colors ${
                      item.isFavorite
                        ? "text-accent"
                        : "text-border sm:opacity-0 sm:group-hover:opacity-100 hover:text-accent"
                    }`}
                  >
                    <Icon
                      name="star"
                      className="h-4 w-4"
                      fill={item.isFavorite ? "currentColor" : "none"}
                    />
                  </button>

                  <button
                    onClick={() => addToCart(item)}
                    disabled={isOrderEditing}
                    className="w-full pr-6 text-left disabled:cursor-grab"
                  >
                    {item.category && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {item.category}
                      </span>
                    )}
                    <p className="mt-1 line-clamp-2 min-h-[38px] text-[13px] font-medium leading-snug text-text sm:text-sm">
                      {item.name}
                    </p>
                    <p className="tabular mt-2 font-display text-[16px] font-semibold text-primary sm:text-[17px]">
                      {formatCurrency(item.price)}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon="search"
                title="No items match"
                description={
                  menuItems.length
                    ? "Try a different search term or category."
                    : "Add items under Configuration to start billing."
                }
              />
            </Card>
          )}
        </div>

        {/* --------------------------------------------- desktop order rail -- */}
        <div className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
          <Card className="flex max-h-[calc(100vh-7rem)] flex-col">
            <OrderPanel {...panelProps} />
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------ mobile order bar -- */}
      <div className="print-hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface/95 backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">
              {cartCount ? `${cartCount} item${cartCount === 1 ? "" : "s"}` : "No items"}
            </p>
            <p className="tabular font-display text-[19px] font-semibold leading-tight text-primary">
              {formatCurrency(grandTotal)}
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => setIsSheetOpen(true)}
            disabled={!cart.length}
            className="shrink-0"
          >
            <Icon name="billing" className="h-4 w-4" />
            View order
          </Button>
        </div>
      </div>

      {/* --------------------------------------------- mobile order sheet -- */}
      {isSheetOpen && (
        <div className="print-hidden fixed inset-0 z-50 flex flex-col justify-end xl:hidden">
          <button
            aria-label="Close order"
            onClick={() => setIsSheetOpen(false)}
            className="absolute inset-0 cursor-default bg-[#1f2421]/45"
          />
          <div className="relative flex max-h-[92vh] flex-col rounded-t-2xl border-t border-border bg-surface">
            <OrderPanel {...panelProps} onClose={() => setIsSheetOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default Billing;
