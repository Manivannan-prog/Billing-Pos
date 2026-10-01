/**
 * Local storage behind offline billing.
 *
 * Two jobs, both deliberately dumb:
 *
 *  1. A CACHE of the few things the billing screen cannot open without - the
 *     menu, the shop settings, the open session, the last bill number. Written
 *     on every successful online read, read back when the network is gone.
 *
 *  2. An OUTBOX of sales that were rung up while offline, replayed in order
 *     once the network returns.
 *
 * Everything is keyed by shop id, so two accounts on one machine never read
 * each other's queue. There is no IndexedDB and no service worker: a till
 * holds hundreds of bills a day, not millions, and localStorage is synchronous,
 * which is what we want at the moment a sale is completed.
 */

const PREFIX = "pos_offline";

const key = (name, shopId) => `${PREFIX}:${name}:${shopId}`;

const read = (storageKey, fallback) => {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (storageKey, value) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    // Quota exhausted, or storage disabled. The caller must still work.
    return false;
  }
};

/* ----------------------------------------------------------------- network */

export const isOnline = () =>
  typeof navigator === "undefined" || navigator.onLine !== false;

/**
 * Did this fail because the network is gone, or because the server said no?
 *
 * Only the former may be queued. A row rejected by row-level security, a
 * duplicate bill number or a validation error is a real answer from the
 * server, and retrying it forever would hide a genuine bug.
 */
export function isNetworkError(error) {
  if (!isOnline()) return true;
  if (!error) return false;

  // PostgREST and Postgres errors carry a code; those are real answers.
  if (error.code && !/^(ECONN|ETIMEDOUT|ENOTFOUND|FETCH)/i.test(String(error.code))) {
    return false;
  }
  if (error.status >= 400 && error.status < 500) return false;

  const message = String(error.message || error);
  return (
    error.name === "TypeError" ||
    error.name === "AbortError" ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(message)
  );
}

/* ------------------------------------------------------------------- cache */

export const cacheGet = (name, shopId, fallback = null) =>
  shopId ? read(key(name, shopId), fallback) : fallback;

export const cacheSet = (name, shopId, value) => {
  if (shopId) write(key(name, shopId), value);
  return value;
};

/* ------------------------------------------------------- bill number state */

/**
 * The last bill number this till used, online or off, as an integer.
 * Offline numbering continues from here so the printed series has no gaps.
 */
export const lastBillNumber = (shopId) => Number(cacheGet("lastBill", shopId, 0)) || 0;

export const setLastBillNumber = (shopId, value) => {
  const next = Number(value) || 0;
  // Never move the series backwards: a stale read must not re-issue a number.
  if (next > lastBillNumber(shopId)) cacheSet("lastBill", shopId, next);
  return next;
};

/** "BILL-1042" -> 1042. Returns 0 for anything unparseable. */
export const billNumberToInt = (value) => {
  const digits = String(value ?? "").match(/(\d+)\s*$/);
  return digits ? Number(digits[1]) : 0;
};

export const intToBillNumber = (value) => `BILL-${value}`;

/* ------------------------------------------------------------------ outbox */

export const outbox = (shopId) => cacheGet("outbox", shopId, []) ?? [];

export function outboxAdd(shopId, entry) {
  const queue = outbox(shopId);
  queue.push(entry);
  cacheSet("outbox", shopId, queue);
  return entry;
}

export function outboxRemove(shopId, entryId) {
  cacheSet("outbox", shopId, outbox(shopId).filter((item) => item.id !== entryId));
}

export function outboxReplace(shopId, entryId, patch) {
  cacheSet(
    "outbox",
    shopId,
    outbox(shopId).map((item) => (item.id === entryId ? { ...item, ...patch } : item)),
  );
}

export const outboxCount = (shopId) => outbox(shopId).length;

/** Clears the queue for a shop. Used when signing out of a demo, and by tests. */
export const outboxClear = (shopId) => cacheSet("outbox", shopId, []);
