/* eslint-disable react-refresh/only-export-components --
   The provider, its hook and the route guard are one unit; splitting them buys
   nothing but extra files, and this module is not hot-reload sensitive. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { auth } from "./db";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    let next;
    try {
      next = await auth.currentProfile();
    } catch {
      next = null;
    }
    setProfile(next ?? null);
    setIsLoading(false);
  }, []);

  // Load the signed-in profile once, then re-read it whenever the auth layer
  // reports a change (sign in, sign out, token refresh).
  useEffect(() => {
    let active = true;

    const sync = async () => {
      let next;
      try {
        next = await auth.currentProfile();
      } catch {
        next = null;
      }
      if (!active) return;
      setProfile(next ?? null);
      setIsLoading(false);
    };

    void sync();
    const unsubscribe = auth.onChange(sync);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (username, password) => {
    const next = await auth.signIn(username, password);
    setProfile(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      profile,
      isLoading,
      isAdmin: profile?.role === "admin",
      signIn,
      signOut,
      refresh,
    }),
    [profile, isLoading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

/**
 * Blocks a route until someone is signed in, then checks the role.
 *
 * `adminOnly` is the vendor's own screens. `shopOnly` is the point of sale:
 * one login is one shop, and an admin owns no shop, so the till, the menu and
 * that shop's reports are not the admin's to open - the admin reads a shop
 * through /shops/:shopId instead.
 */
export function RequireAuth({ children, adminOnly = false, shopOnly = false }) {
  const { profile, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && profile.role !== "admin") return <Navigate to="/" replace />;
  if (shopOnly && profile.role !== "user") return <Navigate to="/users" replace />;

  return children;
}
