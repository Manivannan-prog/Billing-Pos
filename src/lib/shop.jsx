/* eslint-disable react-refresh/only-export-components --
   The provider and its hook belong together; splitting them buys nothing but
   an extra file, and this module is not hot-reload sensitive. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { menu as menuApi, settings as settingsApi } from "./db";
import { useAuth } from "./auth";

const ShopContext = createContext(null);

export const DEFAULT_SETTINGS = {
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

const EMPTY = { settings: DEFAULT_SETTINGS, menuItems: [], isLoading: true, error: "" };

/**
 * Holds the two things nearly every screen needs - shop settings and the menu -
 * so a price change in Configuration is reflected on the billing grid and the
 * next receipt without a page reload.
 */
export function ShopProvider({ children }) {
  const { profile } = useAuth();
  const [state, setState] = useState(EMPTY);

  const reload = useCallback(async () => {
    if (!profile) return;

    try {
      const [nextSettings, nextMenu] = await Promise.all([settingsApi.get(), menuApi.list()]);
      setState({
        settings: { ...DEFAULT_SETTINGS, ...nextSettings },
        menuItems: nextMenu,
        isLoading: false,
        error: "",
      });
    } catch (loadError) {
      setState((current) => ({ ...current, isLoading: false, error: loadError.message }));
    }
  }, [profile]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Signed out, there is nothing to show and nothing still loading. Deriving
  // that here avoids writing state from an effect just to clear it.
  const value = useMemo(
    () => ({
      settings: profile ? state.settings : DEFAULT_SETTINGS,
      menuItems: profile ? state.menuItems : [],
      isLoading: profile ? state.isLoading : false,
      error: state.error,
      reload,
    }),
    [profile, state, reload],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside <ShopProvider>.");
  return context;
}
