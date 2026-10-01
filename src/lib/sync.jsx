/* eslint-disable react-refresh/only-export-components --
   The provider and its hook belong together; splitting them buys nothing but
   an extra file, and this module is not hot-reload sensitive. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { onSyncChange, pendingCount, sync as runSync } from "./db";
import { useAuth } from "./auth";

const SyncContext = createContext(null);

// Slow on purpose. The browser's `online` event does the real work; this is
// only a safety net for the case where the laptop believes it is online but
// the connection is actually dead, which `online` never fires for.
const RETRY_MS = 30000;

/**
 * Tracks whether the till is online and how many bills are waiting to upload,
 * and flushes the queue whenever the network comes back.
 */
export function SyncProvider({ children }) {
  const { profile } = useAuth();

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  const [pending, setPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // A ref, not state: the interval and the event listeners must see the live
  // value without being torn down and rebuilt on every change.
  const busy = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      setPending(await pendingCount());
    } catch {
      setPending(0);
    }
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || !profile) return null;
    busy.current = true;
    setIsSyncing(true);
    try {
      const result = await runSync();
      if (result.failed.length > 0 || result.renumbered?.length > 0) setLastResult(result);
      return result;
    } catch {
      return null;
    } finally {
      busy.current = false;
      setIsSyncing(false);
      await refreshCount();
    }
  }, [profile, refreshCount]);

  useEffect(() => {
    // Signed out there is no queue to watch. The count is zeroed by deriving
    // it below rather than by writing state from here.
    if (!profile) return undefined;

    let active = true;

    const goOnline = () => {
      if (!active) return;
      setIsOnline(true);
      void flush();
    };
    const goOffline = () => active && setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const unsubscribe = onSyncChange(() => active && void refreshCount());
    const timer = setInterval(() => {
      if (active && navigator.onLine !== false) void flush();
    }, RETRY_MS);

    // Anything left over from the last session uploads as soon as we start.
    // Both calls await the storage/network before touching state, so there is
    // no synchronous cascade; the rule cannot see past the call, hence the
    // narrow exemption - the same one Reports.jsx uses for its initial load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCount().then(() => flush());

    return () => {
      active = false;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      unsubscribe();
      clearInterval(timer);
    };
  }, [profile, flush, refreshCount]);

  const value = useMemo(
    () => ({
      isOnline,
      pending: profile ? pending : 0,
      isSyncing,
      lastResult,
      syncNow: flush,
      dismissResult: () => setLastResult(null),
    }),
    [isOnline, pending, isSyncing, lastResult, flush, profile],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  // Rendered outside the provider (the login screen), there is nothing to sync.
  return (
    context ?? {
      isOnline: true,
      pending: 0,
      isSyncing: false,
      lastResult: null,
      syncNow: async () => null,
      dismissResult: () => {},
    }
  );
}
