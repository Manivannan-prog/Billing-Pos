/**
 * Single data entry point for the whole app.
 *
 * Components import from here and never touch Supabase or localStorage
 * directly, so swapping the backing store is a one-line change.
 *
 * With Supabase configured the offline wrapper is used rather than the raw
 * adapter, so a network drop queues sales instead of losing them. Demo mode is
 * already local-only, so it needs none of that.
 */
import { isBackendConfigured } from "../supabase";
import * as local from "./localAdapter";
import * as offline from "./offlineAdapter";

const adapter = isBackendConfigured ? offline : local;

export const isDemoMode = !isBackendConfigured;

export const { auth, settings, menu, sales, sessions, users, shops } = adapter;

/* Sync surface. Demo mode has nothing to sync, so these are inert there. */
export const sync = adapter.sync ?? (async () => ({ uploaded: 0, failed: [], remaining: 0 }));
export const pendingCount = adapter.pendingCount ?? (async () => 0);
export const isSyncing = adapter.isSyncing ?? (() => false);
export const onSyncChange = adapter.onSyncChange ?? (() => () => {});
