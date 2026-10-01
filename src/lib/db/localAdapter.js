/**
 * Demo adapter - mirrors the Supabase adapter's API against localStorage.
 *
 * This exists so the app runs on a fresh checkout with no backend: you can walk
 * the whole UI, ring up sales and manage users before the Supabase project is
 * created. It is NOT the production path - data never leaves the browser, and
 * passwords are stored in plain text here. The moment VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set, src/lib/db/index.js switches to Supabase and
 * none of this code runs.
 */
import { defaultMenu } from "../../data/defaultMenu";

const KEYS = {
  settings: "pos_demo_settings",
  menu: "pos_demo_menu",
  sales: "pos_demo_sales",
  sessions: "pos_demo_sessions",
  users: "pos_demo_users",
  session: "pos_demo_active_session",
  counter: "pos_demo_bill_counter",
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 60));

const SESSION_USER_KEY = "pos_demo_current_user";

/* --------------------------------------------------------------- tenancy --
   Demo mode mirrors the real tenancy model: one login = one shop. Each shop's
   data lives under its own storage key, so the seeded `shop` account and any
   account you create from Users & Access never see each other's sales, menu or
   settings. An `admin` owns no shop and reads whichever one it is viewing.
-------------------------------------------------------------------------- */

const scoped = (key, shopId) => `${key}::${shopId}`;

const profileNow = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** The signed-in shop's id, or null for an admin (who owns no shop). */
const currentShopId = () => {
  const profile = profileNow();
  return profile?.role === "user" ? profile.id : null;
};

/** Resolves an explicit shopId (admin view) against the signed-in shop. */
const targetShop = (shopId) => shopId ?? currentShopId();

/** What a newly created shop starts with - matches the Supabase column defaults. */
const BLANK_SETTINGS = {
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

const DEFAULT_SETTINGS = {
  shopName: "Greenwhisk Kitchen",
  address: "12 Anna Salai, Chennai 600002",
  phone: "+91 98400 00000",
  gstNumber: "33ABCDE1234F1Z5",
  upiId: "greenwhisk@upi",
  logo: "",
  enableGST: true,
  gstPercentage: 5,
  enableDiscount: false,
  discountPercentage: 0,
};

const SEED_USERS = [
  { id: uid(), username: "admin", password: "admin123", fullName: "DM Billing Admin", role: "admin", isActive: true, createdAt: new Date().toISOString() },
  { id: uid(), username: "shop", password: "shop123", fullName: "Greenwhisk Kitchen", role: "user", isActive: true, createdAt: new Date().toISOString() },
];

const seedUsers = () => {
  const existing = read(KEYS.users, null);
  if (existing?.length) return existing;
  write(KEYS.users, SEED_USERS);
  return SEED_USERS;
};

const seedMenu = (shopId) => {
  if (!shopId) return [];

  const key = scoped(KEYS.menu, shopId);
  const existing = read(key, null);
  if (existing) return existing;

  // Only the demo shop starts with a menu. A shop you create yourself starts
  // empty, which is what happens against Supabase too.
  const isDemoShop = seedUsers().some(
    (user) => user.id === shopId && user.username === "shop",
  );
  const seeded = isDemoShop
    ? defaultMenu.map((item, index) => ({
        id: uid(),
        name: item.name,
        price: item.price,
        category: item.category,
        isActive: true,
        isFavorite: index < 2,
        sortOrder: index,
      }))
    : [];

  write(key, seeded);
  return seeded;
};


/* ------------------------------------------------------------------ auth -- */

export const auth = {
  async signIn(username, password) {
    const account = seedUsers().find(
      (user) => user.username.toLowerCase() === String(username).trim().toLowerCase(),
    );
    if (!account || account.password !== password) {
      throw new Error("Incorrect username or password.");
    }
    if (!account.isActive) throw new Error("This account has been disabled.");

    const profile = { ...account };
    delete profile.password;
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event("pos-auth-change"));
    return delay(profile);
  },

  async signOut() {
    sessionStorage.removeItem(SESSION_USER_KEY);
    window.dispatchEvent(new Event("pos-auth-change"));
  },

  async currentProfile() {
    try {
      const raw = sessionStorage.getItem(SESSION_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  onChange(callback) {
    const handler = () => callback();
    window.addEventListener("pos-auth-change", handler);
    return () => window.removeEventListener("pos-auth-change", handler);
  },
};

/* -------------------------------------------------------------- settings -- */

export const settings = {
  async get(shopId) {
    const shop = targetShop(shopId);
    if (!shop) return delay({ ...DEFAULT_SETTINGS });

    // Only the demo shop starts pre-filled; a shop you create starts blank.
    const isDemoShop = seedUsers().some(
      (user) => user.id === shop && user.username === "shop",
    );
    const base = isDemoShop ? DEFAULT_SETTINGS : BLANK_SETTINGS;
    return delay({ ...base, ...read(scoped(KEYS.settings, shop), {}) });
  },

  async save(next) {
    const shop = currentShopId();
    if (!shop) throw new Error("Only a shop account can change shop settings.");
    write(scoped(KEYS.settings, shop), next);
    return delay(next);
  },
};

/* ------------------------------------------------------------------ menu -- */

/** Every write below targets the signed-in shop; an admin cannot write at all. */
const writableShop = () => {
  const shop = currentShopId();
  if (!shop) throw new Error("Only a shop account can change the menu.");
  return shop;
};

export const menu = {
  async list(shopId) {
    const shop = targetShop(shopId);
    if (!shop) return delay([]);

    const items = seedMenu(shop).filter((item) => item.isActive !== false);
    return delay([...items].sort((a, b) => a.sortOrder - b.sortOrder));
  },

  async create(item) {
    const shop = writableShop();
    const items = seedMenu(shop);
    const created = {
      id: uid(),
      name: item.name,
      price: Number(item.price) || 0,
      category: item.category || "",
      isActive: true,
      isFavorite: false,
      sortOrder: items.length,
    };
    write(scoped(KEYS.menu, shop), [...items, created]);
    return delay(created);
  },

  async update(item) {
    const shop = writableShop();
    const items = seedMenu(shop).map((existing) =>
      existing.id === item.id
        ? { ...existing, name: item.name, price: Number(item.price) || 0, category: item.category || "" }
        : existing,
    );
    write(scoped(KEYS.menu, shop), items);
    return delay(items.find((existing) => existing.id === item.id));
  },

  async remove(id) {
    const shop = writableShop();
    write(
      scoped(KEYS.menu, shop),
      seedMenu(shop).map((item) => (item.id === id ? { ...item, isActive: false } : item)),
    );
    return delay(true);
  },

  async saveOrder(ids) {
    const shop = writableShop();
    const order = new Map(ids.map((id, index) => [String(id), index]));
    write(
      scoped(KEYS.menu, shop),
      seedMenu(shop).map((item) => ({
        ...item,
        sortOrder: order.has(String(item.id)) ? order.get(String(item.id)) : item.sortOrder,
      })),
    );
    return delay(true);
  },

  async setFavorite(id, isFavorite) {
    const shop = writableShop();
    write(
      scoped(KEYS.menu, shop),
      seedMenu(shop).map((item) => (item.id === id ? { ...item, isFavorite } : item)),
    );
    return delay(true);
  },
};

/* ----------------------------------------------------------------- sales -- */

export const sales = {
  async list({ shopId } = {}) {
    const shop = targetShop(shopId);
    if (!shop) return delay([]);

    const rows = read(scoped(KEYS.sales, shop), []);
    return delay(
      [...rows].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate)),
    );
  },

  // Each shop keeps its own bill series, exactly as bill_counters does in Postgres.
  async peekBillNumber() {
    const shop = currentShopId();
    if (!shop) return delay("BILL-1001");
    return delay(`BILL-${(read(scoped(KEYS.counter, shop), 1000) || 1000) + 1}`);
  },

  async nextBillNumber() {
    const shop = currentShopId();
    if (!shop) throw new Error("Only a shop account can issue a bill number.");

    const next = (read(scoped(KEYS.counter, shop), 1000) || 1000) + 1;
    write(scoped(KEYS.counter, shop), next);
    return delay(`BILL-${next}`);
  },

  async create(sale) {
    const shop = currentShopId();
    if (!shop) throw new Error("Only a shop account can record a sale.");

    const profile = profileNow();
    const record = {
      ...sale,
      id: uid(),
      shopId: shop,
      createdBy: profile?.id ?? null,
      soldByName: profile?.fullName ?? "",
      saleDate: new Date(sale.createdDate).toLocaleString(),
    };
    const key = scoped(KEYS.sales, shop);
    write(key, [...read(key, []), record]);
    return delay(record);
  },

  async update(sale) {
    const shop = currentShopId();
    if (!shop) throw new Error("Only a shop account can edit a sale.");

    const key = scoped(KEYS.sales, shop);
    write(
      key,
      read(key, []).map((existing) => (existing.id === sale.id ? { ...existing, ...sale } : existing)),
    );
    return delay(sale);
  },
};

/* -------------------------------------------------------------- sessions -- */

const newSession = () => ({
  id: uid(),
  startTime: new Date().toISOString(),
  closedAt: null,
  billCount: 0,
  totalSales: 0,
  paymentTotals: {},
});

export const sessions = {
  // Null for an admin, who owns no till - the same contract as current_session().
  async current() {
    const shop = currentShopId();
    if (!shop) return delay(null);

    const key = scoped(KEYS.session, shop);
    let active = read(key, null);
    if (!active) {
      active = newSession();
      write(key, active);
    }
    return delay(active);
  },

  async close() {
    const shop = currentShopId();
    if (!shop) throw new Error("Only a shop account can close a sale session.");

    const active = await sessions.current();
    const rows = read(scoped(KEYS.sales, shop), []).filter(
      (sale) => sale.sessionId === active.id,
    );
    const closed = {
      ...active,
      closedAt: new Date().toISOString(),
      billCount: rows.length,
      totalSales: rows.reduce((total, sale) => total + Number(sale.grandTotal || 0), 0),
      paymentTotals: rows.reduce((totals, sale) => {
        const mode = sale.paymentMode || "Unknown";
        totals[mode] = (totals[mode] || 0) + Number(sale.grandTotal || 0);
        return totals;
      }, {}),
    };
    const closedKey = scoped(KEYS.sessions, shop);
    write(closedKey, [...read(closedKey, []), closed]);
    write(scoped(KEYS.session, shop), newSession());
    return delay(closed);
  },

  async listClosed(shopId) {
    const shop = targetShop(shopId);
    if (!shop) return delay([]);
    return delay(read(scoped(KEYS.sessions, shop), []));
  },
};

/* ----------------------------------------------------------------- shops -- */

export const shops = {
  async list() {
    const rows = seedUsers()
      .filter((user) => user.role === "user")
      .map((user) => {
        const saleRows = read(scoped(KEYS.sales, user.id), []);
        const shopSettings = read(scoped(KEYS.settings, user.id), {});
        const dates = saleRows.map((sale) => sale.createdDate).filter(Boolean);
        return {
          shopId: user.id,
          username: user.username,
          fullName: user.fullName || user.username,
          shopName: shopSettings.shopName || (user.username === "shop" ? DEFAULT_SETTINGS.shopName : ""),
          gstNumber: shopSettings.gstNumber || (user.username === "shop" ? DEFAULT_SETTINGS.gstNumber : ""),
          isActive: user.isActive !== false,
          createdAt: user.createdAt,
          billCount: saleRows.length,
          totalSales: saleRows.reduce((total, sale) => total + Number(sale.grandTotal || 0), 0),
          lastSaleAt: dates.length
            ? dates.reduce((latest, at) => (new Date(at) > new Date(latest) ? at : latest))
            : null,
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));
    return delay(rows);
  },

  async get(shopId) {
    const all = await shops.list();
    return all.find((shop) => shop.shopId === shopId) ?? null;
  },
};

/* ----------------------------------------------------------------- users -- */

const publicUser = (user) => {
  const copy = { ...user };
  delete copy.password;
  return copy;
};

export const users = {
  async list() {
    return delay(seedUsers().map(publicUser));
  },

  async create({ username, password, fullName, role }) {
    const all = seedUsers();
    const name = String(username).trim().toLowerCase();

    if (!/^[a-z0-9._-]{3,30}$/i.test(name)) {
      throw new Error("Username must be 3-30 characters: letters, numbers, dot, dash or underscore.");
    }
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (all.some((user) => user.username.toLowerCase() === name)) {
      throw new Error(`The username "${name}" is already taken.`);
    }

    const created = {
      id: uid(),
      username: name,
      password,
      fullName: fullName?.trim() || name,
      role: role === "admin" ? "admin" : "user",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    write(KEYS.users, [...all, created]);
    return delay(publicUser(created));
  },

  async update(id, patch) {
    const all = seedUsers();
    const activeAdmins = all.filter((user) => user.role === "admin" && user.isActive);
    const target = all.find((user) => user.id === id);

    if (
      activeAdmins.length <= 1 &&
      target?.role === "admin" &&
      target?.isActive &&
      (patch.role === "user" || patch.isActive === false)
    ) {
      throw new Error("This is the last active admin. Promote another admin first.");
    }

    const updated = all.map((user) =>
      user.id === id
        ? {
            ...user,
            fullName: patch.fullName ?? user.fullName,
            role: patch.role ?? user.role,
            isActive: patch.isActive ?? user.isActive,
          }
        : user,
    );
    write(KEYS.users, updated);
    return delay(publicUser(updated.find((user) => user.id === id)));
  },

  async resetPassword(id, password) {
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    write(
      KEYS.users,
      seedUsers().map((user) => (user.id === id ? { ...user, password } : user)),
    );
    return delay(true);
  },

  async remove(id) {
    const all = seedUsers();
    const current = await auth.currentProfile();
    if (current?.id === id) {
      throw new Error("You cannot delete the account you are signed in with.");
    }

    const activeAdmins = all.filter((user) => user.role === "admin" && user.isActive);
    const target = all.find((user) => user.id === id);
    if (activeAdmins.length <= 1 && target?.role === "admin" && target?.isActive) {
      throw new Error("This is the last active admin. Create another admin first.");
    }

    write(KEYS.users, all.filter((user) => user.id !== id));

    // Deleting the login deletes the shop, so drop its data with it - the same
    // thing the on delete cascade does in Postgres.
    [KEYS.settings, KEYS.menu, KEYS.sales, KEYS.sessions, KEYS.session, KEYS.counter].forEach(
      (key) => localStorage.removeItem(scoped(key, id)),
    );

    return delay(true);
  },
};
