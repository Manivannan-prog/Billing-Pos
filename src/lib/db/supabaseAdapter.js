import { supabase, emailForUsername, functionsUrl } from "../supabase";

/* ---------------------------------------------------------------- mapping --
   The UI speaks camelCase sale objects; Postgres speaks snake_case columns.
   All translation lives here so no component has to know the table shape.
--------------------------------------------------------------------------- */

const toNumber = (value) => Number(value) || 0;

const mapSale = (row) => ({
  id: row.id,
  transactionId: row.transaction_id,
  billNumber: row.bill_number,
  sessionId: row.session_id,
  customerName: row.customer_name || "",
  customerMobile: row.customer_mobile || "",
  paymentMode: row.payment_mode || "Cash",
  subtotal: toNumber(row.subtotal),
  gstAmount: toNumber(row.gst_amount),
  discountAmount: toNumber(row.discount_amount),
  grandTotal: toNumber(row.grand_total),
  collectedAmount: toNumber(row.collected_amount),
  createdDate: row.created_date,
  saleDate: new Date(row.created_date).toLocaleString(),
  createdBy: row.created_by,
  soldByName: row.profiles?.full_name || row.profiles?.username || "",
  items: (row.sale_items || []).map((item) => ({
    id: item.menu_item_id || item.id,
    menuItemId: item.menu_item_id,
    name: item.name,
    price: toNumber(item.price),
    quantity: Number(item.quantity) || 0,
  })),
});

const mapSettings = (row) => ({
  shopName: row.shop_name || "",
  address: row.address || "",
  phone: row.phone || "",
  gstNumber: row.gst_number || "",
  upiId: row.upi_id || "",
  logo: row.logo || "",
  enableGST: Boolean(row.enable_gst),
  gstPercentage: toNumber(row.gst_percentage),
  enableDiscount: Boolean(row.enable_discount),
  discountPercentage: toNumber(row.discount_percentage),
});

const mapMenuItem = (row) => ({
  id: row.id,
  name: row.name,
  price: toNumber(row.price),
  category: row.category || "",
  isActive: row.is_active !== false,
  isFavorite: Boolean(row.is_favorite),
  sortOrder: Number(row.sort_order) || 0,
});

// current_session() returns NULL for an admin, who owns no till. Postgres can
// hand that back as an all-null composite rather than a plain null, so the id
// is what decides whether there is really a session here.
const mapSession = (row) =>
  row?.id
    ? {
        id: row.id,
        shopId: row.shop_id,
        startTime: row.opened_at,
        closedAt: row.closed_at,
        billCount: Number(row.bill_count) || 0,
        totalSales: toNumber(row.total_sales),
        paymentTotals: row.payment_totals || {},
      }
    : null;

const mapShop = (row) => ({
  shopId: row.shop_id,
  username: row.username,
  fullName: row.full_name || row.username,
  shopName: row.shop_name || "",
  gstNumber: row.gst_number || "",
  isActive: row.is_active !== false,
  createdAt: row.created_at,
  billCount: Number(row.bill_count) || 0,
  totalSales: toNumber(row.total_sales),
  lastSaleAt: row.last_sale_at,
});

const mapProfile = (row) =>
  row && {
    id: row.id,
    username: row.username,
    fullName: row.full_name || row.username,
    role: row.role,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
  };

// Keeps the Postgres error code (e.g. 23505 for a duplicate) on the thrown
// Error, so callers can tell a real rejection from a dropped connection.
const toError = (error) =>
  Object.assign(new Error(error.message), { code: error.code, details: error.details });

const unwrap = ({ data, error }) => {
  if (error) throw toError(error);
  return data;
};

/**
 * The signed-in account's id, which for a shop account is also its shop_id.
 *
 * Every data table defaults shop_id to auth.uid(), so writes never need to
 * send it - this is only for scoping *reads*, and for the admin's read-only
 * view of a shop, where an explicit shopId is passed in instead.
 */
export async function currentUserId() {
  // getSession() reads the persisted session from localStorage, so this still
  // answers correctly with no network - which the offline layer depends on.
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? null;
}

/** Call the admin-users edge function with the caller's own bearer token. */
async function callAdminFunction(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again.");

  const response = await fetch(functionsUrl("admin-users"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `User service failed (${response.status}).`);
  }
  return payload;
}

/* ------------------------------------------------------------------ auth -- */

export const auth = {
  async signIn(username, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    // Supabase returns the same message for unknown user and wrong password,
    // which is what we want to surface - it leaks no account list.
    if (error) throw new Error("Incorrect username or password.");

    const profile = await auth.currentProfile();
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error("This login has no profile. Ask an admin to recreate it.");
    }
    if (!profile.isActive) {
      await supabase.auth.signOut();
      throw new Error("This account has been disabled.");
    }
    return profile;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async currentProfile() {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, role, is_active, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) return null;
    return mapProfile(data);
  },

  onChange(callback) {
    const { data } = supabase.auth.onAuthStateChange(() => callback());
    return () => data.subscription.unsubscribe();
  },
};

/* -------------------------------------------------------------- settings -- */

export const settings = {
  /** `shopId` is for the admin's read-only view; a shop omits it and gets its own. */
  async get(shopId) {
    const target = shopId ?? (await currentUserId());
    if (!target) return mapSettings({});

    const row = unwrap(
      await supabase.from("shop_settings").select("*").eq("shop_id", target).maybeSingle(),
    );
    return row ? mapSettings(row) : mapSettings({});
  },

  async save(next) {
    const shopId = await currentUserId();
    if (!shopId) throw new Error("Your session has expired. Sign in again.");

    // Upsert rather than update: the row is normally provisioned by the
    // provision_shop trigger, but this keeps a shop working even if it is not.
    // RLS still refuses any shop_id but the caller's own, and refuses an admin.
    unwrap(
      await supabase.from("shop_settings").upsert(
        {
          shop_id: shopId,
          shop_name: next.shopName,
          address: next.address,
          phone: next.phone,
          gst_number: next.gstNumber,
          upi_id: next.upiId,
          logo: next.logo,
          enable_gst: next.enableGST,
          gst_percentage: toNumber(next.gstPercentage),
          enable_discount: next.enableDiscount,
          discount_percentage: toNumber(next.discountPercentage),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id" },
      ),
    );
    return next;
  },
};

/* ------------------------------------------------------------------ menu -- */

export const menu = {
  /**
   * `shopId` is for the admin's read-only view. The shop_id filter is explicit
   * rather than left to RLS: an admin may read every shop, so without it the
   * admin would get all three shops' items merged into one list.
   */
  async list(shopId) {
    const target = shopId ?? (await currentUserId());
    if (!target) return [];

    const rows = unwrap(
      await supabase
        .from("menu_items")
        .select("*")
        .eq("shop_id", target)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    );
    return rows.map(mapMenuItem);
  },

  async create(item) {
    const rows = unwrap(
      await supabase
        .from("menu_items")
        .insert({
          name: item.name,
          price: toNumber(item.price),
          category: item.category || "",
          sort_order: Number(item.sortOrder) || 0,
        })
        .select(),
    );
    return mapMenuItem(rows[0]);
  },

  async update(item) {
    const rows = unwrap(
      await supabase
        .from("menu_items")
        .update({
          name: item.name,
          price: toNumber(item.price),
          category: item.category || "",
        })
        .eq("id", item.id)
        .select(),
    );
    return mapMenuItem(rows[0]);
  },

  // Soft delete: sale_items keep a reference, so hard-deleting would rewrite history.
  async remove(id) {
    unwrap(await supabase.from("menu_items").update({ is_active: false }).eq("id", id));
  },

  async saveOrder(ids) {
    await Promise.all(
      ids.map((id, index) =>
        supabase.from("menu_items").update({ sort_order: index }).eq("id", id),
      ),
    );
  },

  async setFavorite(id, isFavorite) {
    unwrap(await supabase.from("menu_items").update({ is_favorite: isFavorite }).eq("id", id));
  },
};

/* ----------------------------------------------------------------- sales -- */

const SALE_SELECT =
  "*, sale_items (id, menu_item_id, name, price, quantity), profiles:created_by (username, full_name)";

export const sales = {
  /** `shopId` is for the admin's read-only view; a shop omits it. */
  async list({ limit = 2000, shopId } = {}) {
    const target = shopId ?? (await currentUserId());
    if (!target) return [];

    const rows = unwrap(
      await supabase
        .from("sales")
        .select(SALE_SELECT)
        .eq("shop_id", target)
        .order("created_date", { ascending: false })
        .limit(limit),
    );
    return rows.map(mapSale);
  },

  // Preview only - does not advance the sequence.
  async peekBillNumber() {
    const { data, error } = await supabase.rpc("peek_bill_number");
    if (error) throw toError(error);
    return data;
  },

  // Consumes a number. Call once, at the moment the sale is saved.
  async nextBillNumber() {
    const { data, error } = await supabase.rpc("next_bill_number");
    if (error) throw toError(error);
    return data;
  },

  /**
   * Safe to call again for the same sale. The header and the items are two
   * requests, so a connection that drops between them leaves a bill with no
   * lines; the offline queue then retries, and this picks up the existing row
   * by its unique transaction id and writes the items, instead of failing on
   * the duplicate or leaving the bill empty.
   */
  async create(sale) {
    // getSession() reads locally; getUser() would be one more network round
    // trip on every sale just to learn our own id.
    const createdBy = await currentUserId();

    const { data: inserted, error } = await supabase
      .from("sales")
      .insert({
        transaction_id: sale.transactionId,
        bill_number: sale.billNumber,
        session_id: sale.sessionId || null,
        customer_name: sale.customerName || "",
        customer_mobile: sale.customerMobile || "",
        payment_mode: sale.paymentMode,
        subtotal: toNumber(sale.subtotal),
        gst_amount: toNumber(sale.gstAmount),
        discount_amount: toNumber(sale.discountAmount),
        grand_total: toNumber(sale.grandTotal),
        collected_amount: toNumber(sale.collectedAmount),
        created_date: sale.createdDate,
        created_by: createdBy,
      })
      .select("id")
      .single();

    let saleId = inserted?.id;
    if (error) {
      if (error.code !== "23505" || !/transaction_id/.test(error.message)) throw toError(error);

      const existing = unwrap(
        await supabase
          .from("sales")
          .select("id")
          .eq("transaction_id", sale.transactionId)
          .maybeSingle(),
      );
      if (!existing) throw toError(error);
      saleId = existing.id;
    }

    await sales.replaceItems(saleId, sale.items);
    return { ...sale, id: saleId };
  },

  async update(sale) {
    if (!sale.id) throw new Error("This bill cannot be edited: it has no database id.");

    unwrap(
      await supabase
        .from("sales")
        .update({
          customer_name: sale.customerName || "",
          customer_mobile: sale.customerMobile || "",
          payment_mode: sale.paymentMode,
          subtotal: toNumber(sale.subtotal),
          gst_amount: toNumber(sale.gstAmount),
          discount_amount: toNumber(sale.discountAmount),
          grand_total: toNumber(sale.grandTotal),
          collected_amount: toNumber(sale.collectedAmount),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sale.id),
    );

    await sales.replaceItems(sale.id, sale.items);
    return sale;
  },

  async replaceItems(saleId, items) {
    unwrap(await supabase.from("sale_items").delete().eq("sale_id", saleId));
    if (!items?.length) return;

    unwrap(
      await supabase.from("sale_items").insert(
        items.map((item) => ({
          sale_id: saleId,
          // A cart line built from a demo/local item may not be a real uuid.
          menu_item_id: /^[0-9a-f-]{36}$/i.test(String(item.id)) ? item.id : null,
          name: item.name,
          price: toNumber(item.price),
          quantity: Number(item.quantity) || 1,
        })),
      ),
    );
  },
};

/* -------------------------------------------------------------- sessions -- */

export const sessions = {
  async current() {
    const { data, error } = await supabase.rpc("current_session");
    if (error) throw toError(error);
    return mapSession(Array.isArray(data) ? data[0] : data);
  },

  async close() {
    const { data, error } = await supabase.rpc("close_sale_session");
    if (error) throw toError(error);
    return mapSession(Array.isArray(data) ? data[0] : data);
  },

  /** `shopId` is for the admin's read-only view; a shop omits it. */
  async listClosed(shopId) {
    const target = shopId ?? (await currentUserId());
    if (!target) return [];

    const rows = unwrap(
      await supabase
        .from("sale_sessions")
        .select("*")
        .eq("shop_id", target)
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false }),
    );
    return rows.map(mapSession);
  },
};

/* ----------------------------------------------------------------- shops -- */

/**
 * The admin's read-only window onto each shop.
 *
 * There is nothing here that a shop account could not already read about
 * itself; the separation is enforced in the database by RLS, not by this
 * module. `shop_overview` is a security_invoker view, so a shop account
 * calling list() sees only its own row.
 */
export const shops = {
  async list() {
    const rows = unwrap(
      await supabase
        .from("shop_overview")
        .select("*")
        .order("username", { ascending: true }),
    );
    return rows.map(mapShop);
  },

  async get(shopId) {
    const row = unwrap(
      await supabase.from("shop_overview").select("*").eq("shop_id", shopId).maybeSingle(),
    );
    return row ? mapShop(row) : null;
  },
};

/* ----------------------------------------------------------------- users -- */

export const users = {
  async list() {
    const { users: rows } = await callAdminFunction({ action: "list" });
    return rows.map(mapProfile);
  },

  async create({ username, password, fullName, role }) {
    const { user } = await callAdminFunction({
      action: "create",
      username,
      password,
      fullName,
      role,
    });
    return mapProfile(user);
  },

  async update(id, patch) {
    const { user } = await callAdminFunction({ action: "update", id, ...patch });
    return mapProfile(user);
  },

  async resetPassword(id, password) {
    await callAdminFunction({ action: "reset-password", id, password });
  },

  async remove(id) {
    await callAdminFunction({ action: "delete", id });
  },
};
