import { defaultMenu } from "../data/defaultMenu";

const SETTINGS_KEY = "billing_settings";

export const defaultSettings = {
  shopName: "",
  address: "",
  phone: "",
  gstNumber: "",
  upiId: "",
  logo: "",

  enableGST: true,
  gstPercentage: 5,

  enableDiscount: false,
  discountPercentage: 0,
};

export const getSettings = () => {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (!data) return { ...defaultSettings };

  try {
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch {
    return { ...defaultSettings };
  }
};

export const saveSettings = (settings) => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(settings)
  );
};

/* -----------------------------
   BILL COUNTER
----------------------------- */

const BILL_COUNTER_KEY = "bill_counter";
const getBillNumberValue = (billNumber) => {
  const match = String(billNumber || "").match(/(\d+)$/);

  return match ? Number(match[1]) : 0;
};

const getNextBillCounterNumber = () => {
  const storedCounter = Number(localStorage.getItem(BILL_COUNTER_KEY)) || 1001;
  const highestSavedBill = getSalesHistory().reduce(
    (highest, sale) => Math.max(highest, getBillNumberValue(sale.billNumber)),
    0
  );

  return Math.max(storedCounter, highestSavedBill + 1);
};

export const getCurrentBillNumber = () => {
  const current = getNextBillCounterNumber();

  localStorage.setItem(BILL_COUNTER_KEY, current);

  return `BILL-${current}`;
};

export const incrementBillNumber = () => {
  const current = getNextBillCounterNumber();

  const next = current + 1;

  localStorage.setItem(
    BILL_COUNTER_KEY,
    next
  );

  return `BILL-${next}`;
};

/* -----------------------------
   MENU ITEMS
----------------------------- */

const MENU_KEY = "menu_items";
const BILLING_ITEM_ORDER_KEY = "billing_item_order";
const FAVORITE_BILLING_ITEMS_KEY = "favorite_billing_items";

export const getMenuItems = () => {
  const data = localStorage.getItem(MENU_KEY);
  if (!data) {
    localStorage.setItem(MENU_KEY, JSON.stringify(defaultMenu));
    return defaultMenu.map((item) => ({ ...item }));
  }

  try {
    const menuItems = JSON.parse(data);
    return Array.isArray(menuItems) ? menuItems : [];
  } catch {
    return [];
  }
};

export const saveMenuItems = (items) => {
  localStorage.setItem(
    MENU_KEY,
    JSON.stringify(items)
  );
};

export const getBillingItemOrder = () => {
  const data = localStorage.getItem(BILLING_ITEM_ORDER_KEY);

  return data ? JSON.parse(data) : [];
};

export const saveBillingItemOrder = (itemIds) => {
  localStorage.setItem(
    BILLING_ITEM_ORDER_KEY,
    JSON.stringify(itemIds)
  );
};

export const getFavoriteBillingItemIds = () => {
  try {
    const itemIds = JSON.parse(localStorage.getItem(FAVORITE_BILLING_ITEMS_KEY) || "[]");
    return Array.isArray(itemIds) ? itemIds.map(String) : [];
  } catch {
    return [];
  }
};

export const saveFavoriteBillingItemIds = (itemIds) => {
  localStorage.setItem(
    FAVORITE_BILLING_ITEMS_KEY,
    JSON.stringify([...new Set(itemIds.map(String))])
  );
};

export const applyBillingItemOrder = (items) => {
  const order = getBillingItemOrder();

  if (!order.length) return items;

  const orderIndex = new Map(order.map((id, index) => [String(id), index]));

  return [...items].sort((first, second) => {
    const firstIndex = orderIndex.has(String(first.id))
      ? orderIndex.get(String(first.id))
      : Number.MAX_SAFE_INTEGER;
    const secondIndex = orderIndex.has(String(second.id))
      ? orderIndex.get(String(second.id))
      : Number.MAX_SAFE_INTEGER;

    return firstIndex - secondIndex;
  });
};

/* -----------------------------
   SALES HISTORY
----------------------------- */

const SALES_KEY = "sales_history";

const roundAmount = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeSale = (sale) => ({
  ...sale,
  items: (sale.items || []).map((item) => ({
    ...item,
    price: roundAmount(item.price),
    quantity: Number(item.quantity) || 0,
  })),
  subtotal: roundAmount(sale.subtotal),
  gstAmount: roundAmount(sale.gstAmount),
  discountAmount: roundAmount(sale.discountAmount),
  grandTotal: roundAmount(sale.grandTotal),
  collectedAmount: roundAmount(sale.collectedAmount),
});

export const getSalesHistory = () => {
  const data = localStorage.getItem(SALES_KEY);
  if (!data) return [];

  try {
    const sales = JSON.parse(data);
    return Array.isArray(sales) ? sales.map(normalizeSale) : [];
  } catch {
    return [];
  }
};

export const saveSale = (sale) => {
  const sales = getSalesHistory();
  const normalizedSale = normalizeSale(sale);
  const saleKey = `${normalizedSale.billNumber}-${normalizedSale.createdDate}`;
  const alreadySaved = sales.some(
    (existingSale) =>
      existingSale.transactionId === normalizedSale.transactionId ||
      `${existingSale.billNumber}-${existingSale.createdDate}` === saleKey
  );

  if (alreadySaved) return normalizedSale;

  sales.push(normalizedSale);

  localStorage.setItem(
    SALES_KEY,
    JSON.stringify(sales)
  );

  return normalizedSale;
};

export const updateSale = (updatedSale) => {
  const sales = getSalesHistory();
  const normalizedSale = normalizeSale(updatedSale);
  const saleKey = `${normalizedSale.billNumber}-${normalizedSale.createdDate}`;
  const updatedSales = sales.map((sale) =>
    sale.transactionId === normalizedSale.transactionId ||
    `${sale.billNumber}-${sale.createdDate}` === saleKey
      ? normalizedSale
      : sale
  );

  localStorage.setItem(
    SALES_KEY,
    JSON.stringify(updatedSales)
  );

  return normalizedSale;
};

/* -----------------------------
   SALE SESSIONS
----------------------------- */

const CURRENT_SESSION_KEY = "current_sale_session";
const CLOSED_SESSIONS_KEY = "closed_sale_sessions";

const createSession = () => ({
  id: `SESSION-${Date.now()}`,
  startTime: new Date().toISOString(),
});

export const getCurrentSession = () => {
  const data = localStorage.getItem(CURRENT_SESSION_KEY);

  if (data) return JSON.parse(data);

  const session = createSession();
  localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));

  return session;
};

export const getClosedSessions = () => {
  const data = localStorage.getItem(CLOSED_SESSIONS_KEY);

  return data ? JSON.parse(data) : [];
};

export const closeCurrentSession = () => {
  const session = getCurrentSession();
  const sales = getSalesHistory();
  const startTime = new Date(session.startTime).getTime();
  const sessionSales = sales.filter((sale) => {
    const saleTime = new Date(sale.createdDate || sale.saleDate).getTime();
    return (
      sale.sessionId === session.id ||
      (!sale.sessionId && !Number.isNaN(saleTime) && saleTime >= startTime)
    );
  });

  const paymentTotals = sessionSales.reduce((totals, sale) => {
    const mode = sale.paymentMode || "Unknown";
    totals[mode] = (totals[mode] || 0) + Number(sale.grandTotal || 0);
    return totals;
  }, {});

  const closedSession = {
    ...session,
    closedAt: new Date().toISOString(),
    billCount: sessionSales.length,
    totalSales: sessionSales.reduce(
      (total, sale) => total + Number(sale.grandTotal || 0),
      0
    ),
    paymentTotals,
  };
  const nextSession = createSession();

  localStorage.setItem(
    CLOSED_SESSIONS_KEY,
    JSON.stringify([...getClosedSessions(), closedSession])
  );
  localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(nextSession));

  return { closedSession, nextSession };
};

/* -----------------------------
   OPTIONAL SUPABASE SYNC
----------------------------- */

const SYNC_QUEUE_KEY = "pending_supabase_sales";

const getSupabaseConfig = () => ({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export const getPendingSyncSales = () => {
  const data = localStorage.getItem(SYNC_QUEUE_KEY);

  return data ? JSON.parse(data) : [];
};

export const queueSaleForSync = (sale) => {
  const pendingSales = getPendingSyncSales();
  const transactionId = sale.transactionId || `${sale.billNumber}-${sale.createdDate}`;
  const withoutCurrentSale = pendingSales.filter(
    (pendingSale) => pendingSale.transactionId !== transactionId
  );

  localStorage.setItem(
    SYNC_QUEUE_KEY,
    JSON.stringify([...withoutCurrentSale, { ...sale, transactionId }])
  );
};

export const syncPendingSales = async () => {
  const { url, anonKey } = getSupabaseConfig();
  const pendingSales = getPendingSyncSales();

  if (!url || !anonKey || !pendingSales.length || !navigator.onLine) {
    return { synced: 0, pending: pendingSales.length };
  }

  const stillPending = [];
  let synced = 0;

  for (const sale of pendingSales) {
    try {
      const response = await fetch(`${url}/rest/v1/sales?on_conflict=transaction_id`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          transaction_id: sale.transactionId,
          bill_number: sale.billNumber,
          created_date: sale.createdDate,
          payment_mode: sale.paymentMode,
          grand_total: sale.grandTotal,
          sale_payload: sale,
        }),
      });

      if (!response.ok) throw new Error("Supabase sync failed");
      synced += 1;
    } catch {
      stillPending.push(sale);
    }
  }

  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(stillPending));

  return { synced, pending: stillPending.length };
};

/* -----------------------------
   SELECTED BILL
----------------------------- */

const SELECTED_BILL_KEY = "selected_bill";

export const saveSelectedBill = (bill) => {
  localStorage.setItem(
    SELECTED_BILL_KEY,
    JSON.stringify(bill)
  );
};

export const getSelectedBill = () => {
  const data = localStorage.getItem(
    SELECTED_BILL_KEY
  );

  return data ? JSON.parse(data) : null;
};
