const SETTINGS_KEY = "billing_settings";

export const defaultSettings = {
  shopName: "Biriyani Billing Software",
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

  return data
    ? JSON.parse(data)
    : defaultSettings;
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

export const getCurrentBillNumber = () => {
  const current =
    Number(localStorage.getItem(BILL_COUNTER_KEY)) || 1001;

  return `BILL-${current}`;
};

export const incrementBillNumber = () => {
  const current =
    Number(localStorage.getItem(BILL_COUNTER_KEY)) || 1001;

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

export const getMenuItems = () => {
  const data = localStorage.getItem(MENU_KEY);

  return data ? JSON.parse(data) : [];
};

export const saveMenuItems = (items) => {
  localStorage.setItem(
    MENU_KEY,
    JSON.stringify(items)
  );
};

/* -----------------------------
   SALES HISTORY
----------------------------- */

const SALES_KEY = "sales_history";

export const getSalesHistory = () => {
  const data = localStorage.getItem(SALES_KEY);

  return data ? JSON.parse(data) : [];
};

export const saveSale = (sale) => {
  const sales = getSalesHistory();

  sales.push(sale);

  localStorage.setItem(
    SALES_KEY,
    JSON.stringify(sales)
  );
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