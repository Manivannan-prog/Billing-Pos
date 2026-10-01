/**
 * Offline-tolerant wrapper around the Supabase adapter.
 *
 * THE RULE: a sale must never be lost because the internet is down. Everything
 * here follows from that.
 *
 *   - Reads the billing screen needs (menu, settings, open session) are cached
 *     on every successful online read and served from cache when offline.
 *   - Bill numbers come from the server when it is reachable, and continue from
 *     the last known number when it is not, so the printed series has no gaps.
 *   - A completed sale is written to Supabase if possible, and to a local
 *     outbox if not. Either way the sale is done and the receipt prints - the
 *     printer bridge is on localhost, so printing never needed the internet.
 *   - sync() replays the outbox in order when the network returns.
 *
 * Only genuine network failures are queued. A row the server actively rejects
 * (row-level security, a duplicate) is a real answer and is surfaced, not
 * retried forever.
 */
import * as remote from "./supabaseAdapter";
import { currentUserId } from "./supabaseAdapter";
import {
  billNumberToInt,
  cacheGet,
  cacheSet,
  intToBillNumber,
  isNetworkError,
  isOnline,
  lastBillNumber,
  outbox,
  outboxAdd,
  outboxCount,
  outboxRemove,
  outboxReplace,
  setLastBillNumber,
} from "../offlineStore";

/* ------------------------------------------------------------- listeners -- */

const listeners = new Set();
let syncing = false;

/** Subscribe to sync-state changes. Returns an unsubscribe function. */
export function onSyncChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

const announce = () => listeners.forEach((callback) => callback());

/* ------------------------------------------------------------------ read -- */

/** Try the network; fall back to cache only when the failure is a network one. */
async function readThrough(name, shopId, load, fallback) {
  try {
    const value = await load();
    cacheSet(name, shopId, value);
    return value;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return cacheGet(name, shopId, fallback) ?? fallback;
  }
}

export const settings = {
  async get(shopId) {
    // An explicit shopId is the admin looking at someone else's shop; that is
    // an online-only screen and must not read this till's cache.
    if (shopId) return remote.settings.get(shopId);

    const me = await currentUserId();
    return readThrough("settings", me, () => remote.settings.get(), {});
  },

  async save(next) {
    const me = await currentUserId();
    const saved = await remote.settings.save(next);
    cacheSet("settings", me, saved);
    return saved;
  },
};

export const menu = {
  async list(shopId) {
    if (shopId) return remote.menu.list(shopId);

    const me = await currentUserId();
    return readThrough("menu", me, () => remote.menu.list(), []);
  },

  // Menu edits are an office task, not a till task: they need the network.
  create: remote.menu.create,
  update: remote.menu.update,
  remove: remote.menu.remove,
  saveOrder: remote.menu.saveOrder,
  setFavorite: remote.menu.setFavorite,
};

export const sessions = {
  async current() {
    const me = await currentUserId();
    try {
      const session = await remote.sessions.current();
      cacheSet("session", me, session);
      return session;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      // The till cannot cash up offline, so the last known session is still
      // the open one. Offline sales hang off it and stay in the right cash-up.
      return cacheGet("session", me, null);
    }
  },

  close: remote.sessions.close,
  listClosed: remote.sessions.listClosed,
};

/* ----------------------------------------------------------------- sales -- */

const CACHED_SALES = 200;

/**
 * Drops the fields that only exist while a sale is queued locally, so the
 * server sees exactly the payload an online sale would have sent. The
 * transaction id stays, and it is unique - that is what makes a retried
 * upload safe.
 */
function stripLocal(sale) {
  const clean = { ...sale };
  delete clean.id;
  delete clean.pendingSync;
  return clean;
}

const localId = () =>
  `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const sales = {
  async list(options = {}) {
    if (options.shopId) return remote.sales.list(options);

    const me = await currentUserId();

    // Online callers (Reports, the Excel export) get the FULL list; only the
    // recent tail is kept in localStorage, because a year of bills would not
    // fit and the offline need is "what did we sell today", not the archive.
    let rows;
    try {
      rows = await remote.sales.list(options);
      cacheSet("sales", me, rows.slice(0, CACHED_SALES));
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      rows = cacheGet("sales", me, []) ?? [];
    }

    // Show bills that are rung up but not yet uploaded, so the day's totals on
    // Overview and Reports are right even mid-outage. A bill whose upload is
    // in flight (or was cut off half-way) is already on the server as well as
    // in the queue; it is shown once, from the server, or it would be counted
    // twice in the totals.
    const onServer = new Set(rows.map((row) => row.transactionId));
    const pending = outbox(me)
      .filter((entry) => entry.kind === "create" && !onServer.has(entry.sale.transactionId))
      .map((entry) => ({ ...entry.sale, pendingSync: true }));

    return [...pending, ...rows].sort(
      (a, b) => new Date(b.createdDate) - new Date(a.createdDate),
    );
  },

  async peekBillNumber() {
    const me = await currentUserId();
    try {
      const number = await remote.sales.peekBillNumber();
      // A peek does not consume, so it must not advance the local series.
      return number;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      return intToBillNumber(lastBillNumber(me) + 1);
    }
  },

  async nextBillNumber() {
    const me = await currentUserId();
    try {
      const number = await remote.sales.nextBillNumber();
      setLastBillNumber(me, billNumberToInt(number));
      return number;
    } catch (error) {
      if (!isNetworkError(error)) throw error;

      const next = lastBillNumber(me) + 1;
      setLastBillNumber(me, next);
      // Marked so sync() knows how far the server counter must be advanced.
      cacheSet("offlineMinted", me, (Number(cacheGet("offlineMinted", me, 0)) || 0) + 1);
      return intToBillNumber(next);
    }
  },

  async create(sale) {
    const me = await currentUserId();
    try {
      return await remote.sales.create(sale);
    } catch (error) {
      if (!isNetworkError(error)) throw error;

      const record = { ...sale, id: localId(), pendingSync: true };
      outboxAdd(me, { id: record.id, kind: "create", sale: record, queuedAt: Date.now() });
      announce();
      return record;
    }
  },

  async update(sale) {
    const me = await currentUserId();

    // Editing a bill that has not been uploaded yet: just rewrite the queued
    // copy, so only one version of it ever reaches the server.
    const queued = outbox(me).find((entry) => entry.id === sale.id);
    if (queued) {
      outboxReplace(me, sale.id, { sale: { ...queued.sale, ...sale } });
      announce();
      return { ...queued.sale, ...sale };
    }

    try {
      return await remote.sales.update(sale);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      outboxAdd(me, { id: localId(), kind: "update", sale, queuedAt: Date.now() });
      announce();
      return { ...sale, pendingSync: true };
    }
  },
};

/* ------------------------------------------------------------------ sync -- */

export async function pendingCount() {
  const me = await currentUserId();
  return me ? outboxCount(me) : 0;
}

export const isSyncing = () => syncing;

/**
 * Replay the outbox, oldest first. Stops at the first network failure so order
 * is preserved; a sale the server actively rejects is dropped from the queue
 * and reported, because retrying it forever would block everything behind it.
 *
 * Re-uploading a sale that already landed is harmless: remote.sales.create()
 * recognises its transaction id and just makes sure the items are there.
 *
 * Returns { uploaded, failed, renumbered, remaining }.
 */
export async function sync() {
  if (syncing) {
    return { uploaded: 0, failed: [], renumbered: [], remaining: await pendingCount() };
  }

  const me = await currentUserId();
  if (!me || !isOnline()) {
    return { uploaded: 0, failed: [], renumbered: [], remaining: me ? outboxCount(me) : 0 };
  }

  syncing = true;
  announce();

  let uploaded = 0;
  const failed = [];
  const renumbered = [];

  try {
    // First move the server's counter past every number this till issued
    // offline. Those numbers are already printed on receipts, so they are
    // taken; doing this before the upload means a bill that has to be
    // renumbered below cannot be handed one of them. next_bill_number()
    // advances by one per call, so once per offline bill lands it exactly.
    let minted = Number(cacheGet("offlineMinted", me, 0)) || 0;
    while (minted > 0) {
      await remote.sales.nextBillNumber();
      minted -= 1;
      cacheSet("offlineMinted", me, minted);
    }

    for (const entry of outbox(me)) {
      try {
        if (entry.kind === "create") {
          await remote.sales.create(stripLocal(entry.sale));
        } else {
          await remote.sales.update(entry.sale);
        }
        outboxRemove(me, entry.id);
        uploaded += 1;
      } catch (error) {
        if (isNetworkError(error)) break; // still offline - keep the rest queued
        let rejection = error;

        // The bill number is already taken on the server - another device on
        // this login billed while this one was offline. The customer has paid,
        // so the sale must not be thrown away: file it under a fresh number and
        // tell the till which printed receipt now carries a different number.
        // (A repeat of the SAME sale never gets here; create() absorbs that.)
        if (entry.kind === "create" && /sales_shop_bill_number_idx/.test(error.message || "")) {
          try {
            // The other device may have used the next few numbers too, so
            // keep drawing until one is free (bounded, in case of a real bug).
            let savedAs = null;
            for (let attempt = 0; attempt < 10 && !savedAs; attempt += 1) {
              const fresh = await remote.sales.nextBillNumber();
              try {
                await remote.sales.create({ ...stripLocal(entry.sale), billNumber: fresh });
                savedAs = fresh;
              } catch (clash) {
                if (!/sales_shop_bill_number_idx/.test(clash.message || "")) throw clash;
              }
            }
            if (!savedAs) {
              throw new Error("No free bill number found after 10 tries.", { cause: error });
            }

            outboxRemove(me, entry.id);
            uploaded += 1;
            renumbered.push({ from: entry.sale.billNumber, to: savedAs });
            continue;
          } catch (retryError) {
            if (isNetworkError(retryError)) break;
            rejection = retryError;
          }
        }

        outboxRemove(me, entry.id);
        failed.push({ billNumber: entry.sale?.billNumber, reason: rejection.message });
      }
    }
  } catch (error) {
    // Advancing the counter failed: nothing has been uploaded yet, the marker
    // still holds what is left, and the next sync picks up from there.
    if (!isNetworkError(error)) throw error;
  } finally {
    syncing = false;
    announce();
  }

  return { uploaded, failed, renumbered, remaining: outboxCount(me) };
}

/* re-exported untouched -------------------------------------------------- */
export const { auth, users, shops } = remote;
