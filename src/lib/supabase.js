import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True once .env holds a Supabase project. Until then the app runs against the
 * local demo adapter so the UI is still fully browsable on a fresh checkout.
 */
export const isBackendConfigured = Boolean(url && anonKey);

export const supabase = isBackendConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Logins are usernames. Supabase Auth needs an email, so each username maps to
// a stable synthetic address. Keep this in step with the admin-users function.
export const USERNAME_DOMAIN = "pos.local";

export const emailForUsername = (username) =>
  `${String(username).trim().toLowerCase()}@${USERNAME_DOMAIN}`;

export const functionsUrl = (name) => `${url}/functions/v1/${name}`;
